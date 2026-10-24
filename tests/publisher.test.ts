import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join, resolve } from "@std/path";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { lintCourse } from "../src/course-linter.ts";
import { publishPackages, staleVersions } from "../src/publisher.ts";

const base = { courseName: "Course", version: "1.0.0", sourcesDir: "lessons" };

Deno.test("staleVersions picks other versions of the same package and nothing else", () => {
  const files = [
    "demo.v0.9.0.imscc",
    "demo.v1.0.0.imscc",
    "demo.v0.9.0.d2l.zip",
    "demo-other.v0.1.0.imscc",
    "notes.txt",
  ];
  assertEquals(staleVersions(files, "demo", "demo.v1.0.0.imscc"), [
    "demo.v0.9.0.imscc",
  ]);
  assertEquals(staleVersions(files, "demo", "demo.v1.0.0.d2l.zip"), [
    "demo.v0.9.0.d2l.zip",
  ]);
  assertEquals(staleVersions(files, "demo", "notes.txt"), []);
});

Deno.test("publishDir is optional, a folder in the repository and not the build output", () => {
  assertEquals(validateConfig({ ...base, publishDir: "publicaties" }), true);
  assertThrows(
    () => validateConfig({ ...base, publishDir: 3 }),
    Error,
    "publishDir",
  );
  assertEquals(resolveConfig(base, {}, "/repo").publishDir, null);
  assertEquals(
    resolveConfig({ ...base, publishDir: "publicaties" }, {}, "/repo")
      .publishDir,
    "/repo/publicaties",
  );
  for (
    const publishDir of ["../elsewhere", "build/brightspace", "build", "."]
  ) {
    assertThrows(
      () =>
        resolveConfig(
          { ...base, publishDir, outputDir: "build/brightspace" },
          {},
          "/repo",
        ),
      Error,
      "publishDir",
    );
  }
});

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "publish-",
  });
  try {
    await run(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("publishPackages copies the package and the pptx files and removes older versions", async () => {
  await fixture(async (root) => {
    const build = join(root, "build");
    const publish = join(root, "publicaties");
    await Deno.mkdir(join(build, "content", "week-1"), { recursive: true });
    await Deno.writeTextFile(
      join(build, "content", "week-1", "lesson-slides-a.pptx"),
      "pptx",
    );
    await Deno.writeTextFile(
      join(build, "content", "week-1", "lesson.html"),
      "html",
    );
    await Deno.writeTextFile(join(build, "demo.v1.0.0.imscc"), "new");
    await Deno.mkdir(join(publish, "brightspace"), { recursive: true });
    await Deno.writeTextFile(
      join(publish, "brightspace", "demo.v0.9.0.imscc"),
      "old",
    );
    await Deno.writeTextFile(join(publish, "brightspace", "README.md"), "keep");
    const result = await publishPackages({
      buildDir: build,
      publishDir: publish,
      name: "demo",
      packages: [join(build, "demo.v1.0.0.imscc")],
    });
    assertEquals(result.copied, [
      "brightspace/demo.v1.0.0.imscc",
      "slides/week-1/lesson-slides-a.pptx",
    ]);
    assertEquals(result.removed, ["brightspace/demo.v0.9.0.imscc"]);
    assertEquals(
      await Deno.readTextFile(
        join(publish, "brightspace", "demo.v1.0.0.imscc"),
      ),
      "new",
    );
    assertEquals(
      await Deno.readTextFile(join(publish, "brightspace", "README.md")),
      "keep",
    );
    assertEquals(
      await Deno.readTextFile(
        join(publish, "slides", "week-1", "lesson-slides-a.pptx"),
      ),
      "pptx",
    );
    await assertRejects(() =>
      Deno.stat(join(publish, "brightspace", "demo.v0.9.0.imscc"))
    );
    // Idempotent: a second run gives the same files and removes nothing
    const again = await publishPackages({
      buildDir: build,
      publishDir: publish,
      name: "demo",
      packages: [join(build, "demo.v1.0.0.imscc")],
    });
    assertEquals(again.removed, []);
  });
});

Deno.test("bso lint warns about a published package of another version, and about nothing else", async () => {
  await fixture(async (root) => {
    await Deno.mkdir(join(root, "lessons"), { recursive: true });
    await Deno.writeTextFile(join(root, "lessons", "lesson.md"), "# Lesson\n");
    const publish = join(root, "publicaties");
    await Deno.mkdir(join(publish, "brightspace"), { recursive: true });
    await Deno.writeTextFile(
      join(publish, "brightspace", "demo.v0.9.0.imscc"),
      "old",
    );
    await Deno.writeTextFile(
      join(publish, "brightspace", "demo.v1.0.0.imscc"),
      "current",
    );
    await Deno.writeTextFile(
      join(publish, "brightspace", "other.v0.1.0.imscc"),
      "other course",
    );
    const config = resolveConfig(
      {
        courseName: "Demo",
        name: "demo",
        version: "1.0.0",
        sourcesDir: "lessons",
        publishDir: "publicaties",
      },
      {},
      root,
    );
    const result = await lintCourse(config);
    const found = result.diagnostics.filter((d) =>
      d.rule === "publish-version-mismatch"
    );
    assertEquals(found.length, 1);
    assertStringIncludes(found[0].sourceFile, "demo.v0.9.0.imscc");
    assertEquals(found[0].severity, "warning");
    assertEquals(result.diagnostics.length, 1);
  });
});
