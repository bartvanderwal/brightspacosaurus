import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { basename, fromFileUrl, join, resolve } from "@std/path";
import { loadConfig, resolveConfig } from "../src/config-loader.ts";
import { DEMO_FILES, runInit } from "../src/init.ts";
import { runBuild, runLint } from "../src/main.ts";

const ROOT = fromFileUrl(new URL("../", import.meta.url));

async function inProject(test: (root: string) => Promise<void>): Promise<void> {
  await Deno.mkdir(join(ROOT, "build"), { recursive: true });
  const root = await Deno.makeTempDir({
    dir: join(ROOT, "build"),
    prefix: "init-",
  });
  try {
    await test(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

async function entries(root: string): Promise<string[]> {
  return (await Array.fromAsync(Deno.readDir(root))).map((entry) => entry.name)
    .sort();
}

Deno.test("init: rule I1 lists additions and the absolute path; defaults to no", async () => {
  for (const answer of [null, "", "n", "no", "maybe"]) {
    await inProject(async (root) => {
      const output: string[] = [];
      await runInit(root, {
        log: (line) => output.push(line),
        ask: (message) => {
          assertEquals(message, `Create a BSO project in ${root}? [y/N]`);
          assertStringIncludes(
            output.join("\n"),
            "brightspacosaurus.config.json",
          );
          assertStringIncludes(
            output.join("\n"),
            "lessons/week-1/lesson-1-fizzbuzz.md",
          );
          return answer;
        },
      });
      assertEquals(await entries(root), []);
      assertStringIncludes(output.join("\n"), "Cancelled");
    });
  }
});

Deno.test("init: rules I1, I3 and I4 accept confirmation and preserve unrelated files", async () => {
  for (const answer of ["y", "YES"]) {
    await inProject(async (root) => {
      await Deno.writeTextFile(join(root, "notes.txt"), "Keep me");
      await runInit(root, { ask: () => answer, log: () => {} });
      assertEquals(await Deno.readTextFile(join(root, "notes.txt")), "Keep me");
      const config = await loadConfig(
        join(root, "brightspacosaurus.config.json"),
      );
      assertEquals(config.courseName, basename(root));
      assertEquals(config.version, "0.1.0");
      assertEquals(config.sourcesDir, "lessons");
      assertEquals(config.outputDir, "build/brightspace");
      assertEquals(config.teacherDashboard, undefined);
      assertEquals(config.docusaurusDir, undefined);
      assertEquals((await entries(root)).sort(), [
        "brightspacosaurus.config.json",
        "lessons",
        "notes.txt",
        "partials",
        "readers",
        "slides",
      ]);
      for (const file of DEMO_FILES) {
        assertEquals(
          await Deno.readFile(join(root, file)),
          await Deno.readFile(join(ROOT, "examples/demo-course", file)),
          file,
        );
      }
    });
  }
});

Deno.test("init: rule I3 inventory includes every demo content file and is packaged", async () => {
  async function files(dir: string, prefix = ""): Promise<string[]> {
    const result: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
      const path = prefix + entry.name;
      if (entry.isDirectory) {
        result.push(...await files(join(dir, entry.name), path + "/"));
      } else result.push(path);
    }
    return result;
  }
  const expected: string[] = [];
  for (const dir of ["lessons", "partials", "readers", "slides"]) {
    expected.push(
      ...await files(join(ROOT, "examples/demo-course", dir), dir + "/"),
    );
  }
  assertEquals([...DEMO_FILES].sort(), expected.sort());
  const pkg = JSON.parse(await Deno.readTextFile(join(ROOT, "deno.json")));
  for (const dir of ["lessons", "partials", "readers", "slides"]) {
    assertEquals(
      pkg.publish.include.includes(`examples/demo-course/${dir}/`),
      true,
    );
  }
});

Deno.test("init: rule I2 reports all conflicts before prompting or writing", async () => {
  await inProject(async (root) => {
    await Deno.mkdir(join(root, "lessons"));
    await Deno.writeTextFile(
      join(root, "brightspacosaurus.config.json"),
      "original config",
    );
    await Deno.writeTextFile(
      join(root, "lessons/README.md"),
      "original lesson",
    );
    let asked = false;
    const error = await assertRejects(
      () =>
        runInit(root, {
          ask: () => {
            asked = true;
            return "y";
          },
          log: () => {},
        }),
      Error,
    );
    assertStringIncludes(error.message, "brightspacosaurus.config.json");
    assertStringIncludes(error.message, "lessons/README.md");
    assertEquals(asked, false);
    assertEquals(
      await Deno.readTextFile(join(root, "lessons/README.md")),
      "original lesson",
    );
    assertEquals(
      await Deno.readTextFile(join(root, "brightspacosaurus.config.json")),
      "original config",
    );
    assertEquals(await entries(root), [
      "brightspacosaurus.config.json",
      "lessons",
    ]);
  });
});

Deno.test("init: rule I2 refuses file and symlink parents, including dangling links", async () => {
  for (const kind of ["file", "symlink", "dangling"]) {
    await inProject(async (root) => {
      const parent = join(root, "lessons");
      if (kind === "file") {
        await Deno.writeTextFile(parent, "Keep me");
      } else {
        await Deno.symlink(
          kind === "symlink" ? root : join(root, "missing"),
          parent,
        );
      }
      const error = await assertRejects(
        () => runInit(root, { yes: true, log: () => {} }),
        Error,
      );
      assertStringIncludes(error.message, "lessons");
      assertEquals(await entries(root), ["lessons"]);
    });
  }
});

Deno.test("init: rule I2 rechecks conflicts introduced during confirmation", async () => {
  await inProject(async (root) => {
    const path = join(root, "brightspacosaurus.config.json");
    await assertRejects(
      () =>
        runInit(root, {
          ask: () => {
            Deno.writeTextFileSync(path, "Keep me");
            return "y";
          },
          log: () => {},
        }),
      Error,
      "conflicts",
    );
    assertEquals(await Deno.readTextFile(path), "Keep me");
    assertEquals(await entries(root), ["brightspacosaurus.config.json"]);
  });
});

Deno.test("init CLI: rules I1, I2 and I5 support both yes flags, next steps and non-zero conflicts", async () => {
  for (const flag of ["--yes", "-y"]) {
    await inProject(async (root) => {
      const run = (...args: string[]) =>
        new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            "--allow-read",
            "--allow-write",
            join(ROOT, "src/main.ts"),
            "init",
            ...args,
          ],
          cwd: root,
          stdin: "null",
          stdout: "piped",
          stderr: "piped",
        }).output();
      const bad = await run("--typo");
      assertEquals(bad.code, 1);
      assertStringIncludes(new TextDecoder().decode(bad.stderr), "--typo");
      assertEquals(await entries(root), []);
      const cancelled = await run();
      assertEquals(cancelled.code, 0);
      assertStringIncludes(
        new TextDecoder().decode(cancelled.stdout),
        "Cancelled",
      );
      assertEquals(await entries(root), []);
      const result = await run(flag);
      const stdout = new TextDecoder().decode(result.stdout);
      assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
      assertStringIncludes(stdout, `Created a BSO project in ${root}.`);
      for (const command of ["lint", "build", "preview", "pack"]) {
        assertStringIncludes(stdout, `bso ${command}`);
      }
      assertStringIncludes(stdout, "Docusaurus");
      assertStringIncludes(stdout, "https://");
      const repeated = await run(flag);
      assertEquals(repeated.code, 1);
      assertStringIncludes(
        new TextDecoder().decode(repeated.stderr),
        "conflicts",
      );
    });
  }
});

Deno.test("init: rule I4 generated demo lints and builds HTML, quizzes and a teacher page", async () => {
  await inProject(async (root) => {
    await runInit(root, { yes: true, log: () => {} });
    const config = resolveConfig(
      await loadConfig(join(root, "brightspacosaurus.config.json")),
      {},
      root,
    );
    await runLint(config);
    const requests: string[] = [];
    const server = Deno.serve({
      hostname: "127.0.0.1",
      port: 0,
      onListen: () => {},
    }, (request) => {
      requests.push(new URL(request.url).pathname);
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg"><title>Demo diagram</title></svg>',
        { headers: { "content-type": "image/svg+xml" } },
      );
    });
    config.diagrams.krokiUrl = `http://127.0.0.1:${server.addr.port}`;
    try {
      await runBuild(config, false, { skipReaders: true, skipSlides: true });
    } finally {
      await server.shutdown();
    }
    assertEquals(requests.includes("/plantuml/svg"), true);
    assertEquals(requests.includes("/mermaid/svg"), true);
    assertStringIncludes(
      await Deno.readTextFile(resolve(config.outputDir, "imsmanifest.xml")),
      basename(root),
    );
    assertStringIncludes(
      await Deno.readTextFile(
        join(config.outputDir, "content/for-teachers.html"),
      ),
      "0.1.0",
    );
    assertEquals(
      (await entries(join(config.outputDir, "quiz", "week-1"))).some((name) =>
        name.endsWith(".xml")
      ),
      true,
    );
    assertEquals(
      config.slides?.generateForPrefix,
      "lesson-",
    );
    assertEquals(config.readersDir, join(root, "readers"));
  });
});
