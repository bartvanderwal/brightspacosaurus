import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { DELIMITER, join, resolve } from "@std/path";
import JSZip from "jszip";
import { resolveConfig } from "../src/config-loader.ts";
import {
  buildUsage,
  decodeHtmlEntities,
  parseArgs,
  unknownCommandMessage,
  runPack,
  runPrepare,
  runLint,
  previewInstallArgs,
  previewNodePath,
  runPreview,
} from "../src/main.ts";
import { loadPackageVersion } from "../src/assets.ts";
import type { ResolvedConfig } from "../src/types.ts";

function testConfig(repoRoot: string): ResolvedConfig {
  return {
    repoRoot,
    sourcesDir: join(repoRoot, "lessons"),
    readersDir: join(repoRoot, "readers"),
    readerCoverLogo: null,
    assetsDir: null,
    outputDir: join(repoRoot, "build", "brightspace"),
    courseName: "Coverage Course",
    version: "0.9.0",
    customCss: null,
    name: "coverage-course",
    docusaurusDir: null,
    teacherManual: null,
    teacherDashboard: null,
    quiz: {
      maxAttempts: 0,
      shuffleAnswers: false,
      locale: "en",
      assignmentPrefix: "Assignment",
      questionPrefix: "Question",
      subquestionPrefix: "Subquestion",
    },
    flashcards: { sectionHeadings: ["Kernbegrippen"] },
    diagrams: {
      krokiUrl: "https://kroki.io",
      output: "img-html-base64",
      failOnError: true,
      locale: "nl",
    },
  };
}

Deno.test("main helpers parse CLI options and decode generated HTML titles", () => {
  assertStringIncludes(buildUsage("0.9.0"), "Brightspacosaurus v0.9.0");
  assertEquals(
    decodeHtmlEntities("A &amp; B &#x26; C &#38; &lt;x&gt;"),
    "A & B & C & <x>",
  );
  assertEquals(
    parseArgs([
      "prepare",
      "--sources",
      "src",
      "--readers-only",
      "--output",
      "out",
      "--config",
      "bso.json",
    ]),
    {
      command: "prepare",
      sources: "src",
      readersOnly: true,
      skipReaders: false,
      output: "out",
      config: "bso.json",
    },
  );
  assertEquals(parseArgs(["pack", "--name", "legacy-name"]), {
    command: "pack",
    sources: "",
    readersOnly: false,
    skipReaders: false,
    output: "legacy-name",
    config: "",
  });
  assertEquals(parseArgs(["prepare", "--skip-readers"])?.skipReaders, true);
  assertEquals(parseArgs(["nope"]), null);
});

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test("runPrepare with skipReaders converts no reader Markdown but still copies pre-built PDFs", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(join(config.sourcesDir, "week-1"), { recursive: true });
    await Deno.mkdir(config.readersDir!, { recursive: true });
    await Deno.writeTextFile(join(config.sourcesDir, "week-1", "les-1.1.md"), "# Les 1.1\n");
    await Deno.writeTextFile(join(config.readersDir!, "reader-git.md"), "# Git\n\nTekst.\n");
    await Deno.writeFile(
      join(config.readersDir!, "reader-plantuml-essentials.pdf"),
      new Uint8Array([37, 80, 68, 70]),
    );

    await runPrepare(config, false, { skipReaders: true });

    const readersOut = join(config.outputDir, "readers");
    assertEquals(await exists(join(readersOut, "reader-git.pdf")), false);
    assertEquals(await exists(join(readersOut, "reader-plantuml-essentials.pdf")), true);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("unknownCommandMessage names only unknown non-option commands (#36)", () => {
  assertEquals(
    unknownCommandMessage(["verzonnen-cmd", "--sources", "x"]),
    "Unknown command 'verzonnen-cmd'.\nRun 'bso --help' for available commands.",
  );
  for (const command of ["prepare", "pack", "preview", "lint"]) {
    assertEquals(unknownCommandMessage([command]), null);
  }
  assertEquals(unknownCommandMessage([]), null);
  assertEquals(unknownCommandMessage(["--help"]), null);
  assertEquals(unknownCommandMessage(["-v"]), null);
});

Deno.test("runPrepare en runPack bouwen een minimale cartridge met lessen, quiz en reader", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(join(config.sourcesDir, "week-1"), { recursive: true });
    await Deno.mkdir(config.readersDir!, { recursive: true });
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "weekintro-1.md"),
      "# Week 1 - Niveau 2\n",
    );
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "les-1.1.md"),
      "# Les 1.1 & intro\n\n![plaatje](image.png)\n\n## Kernbegrippen\n\n- **request:** Bericht van een client.\n",
    );
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "quiz-1.1.md"),
      "# Quiz 1.1\n\n## Vraag 1\n\nWat klopt?\n\n- A. Ja\n- B. Nee\nCorrect answer: A\n",
    );
    await Deno.writeFile(
      join(config.sourcesDir, "week-1", "image.png"),
      new Uint8Array([1, 2, 3]),
    );
    await Deno.writeFile(
      join(config.readersDir!, "reader-plantuml-essentials.pdf"),
      new Uint8Array([37, 80, 68, 70]),
    );

    await runPrepare(config, false, { skipReaders: true });
    assertEquals(await exists(join(config.outputDir, "navigation.json")), true);
    assertEquals(
      await exists(join(config.outputDir, "docusaurus-sidebars.json")),
      true,
    );
    await runPack(config);

    const html = await Deno.readTextFile(
      join(config.outputDir, "content", "week-1", "les-1.1.html"),
    );
    const manifest = await Deno.readTextFile(
      join(config.outputDir, "imsmanifest.xml"),
    );
    const navigation = JSON.parse(
      await Deno.readTextFile(
        join(config.outputDir, "navigation.json"),
      ),
    );
    const sidebars = JSON.parse(
      await Deno.readTextFile(
        join(config.outputDir, "docusaurus-sidebars.json"),
      ),
    );
    const archive = await Deno.stat(
      join(config.outputDir, "coverage-course.v0.9.0.imscc"),
    );

    assertStringIncludes(html, 'class="bso-flashcard-term">request</span>');
    assertStringIncludes(html, "<h1>Les 1.1 &#x26; intro</h1>");
    assertStringIncludes(
      html,
      `BSO v${await loadPackageVersion()} · content v0.9.0`,
    );
    assertStringIncludes(manifest, "<title>Les 1.1 &amp; intro</title>");
    assertEquals(
      manifest.includes("<title>Les 1.1 &#x26; intro</title>"),
      false,
    );
    assertEquals(manifest.includes("&amp;amp;"), false);
    assertStringIncludes(manifest, "<title>Quiz 1.1</title>");
    assertStringIncludes(manifest, "<title>Reader PlantUML essentials</title>");
    const navigationHrefs = navigation.modules.flatMap((
      module: { items: { href: string }[] },
    ) => module.items.map((item) => item.href));
    const resourceHrefs = new Map(
      [...manifest.matchAll(
        /<resource identifier="([^"]+)"[^>]*href="([^"]+)"/g,
      )]
        .map(([, id, href]) => [id, href] as [string, string]),
    );
    const manifestNavigationHrefs = [
      ...manifest.matchAll(
        /<item identifier="item_[^"]+" identifierref="([^"]+)"/g,
      ),
    ].map(([, id]) => resourceHrefs.get(id)!);
    assertEquals(navigationHrefs, manifestNavigationHrefs);
    assertEquals(
      navigationHrefs,
      [
        "content/week-1/weekintro-1.html",
        "content/week-1/les-1.1.html",
        "quiz/week-1/qti-les-1-1.xml",
        "readers/reader-plantuml-essentials.pdf",
      ],
    );
    assertEquals(navigation.modules[0].title, "Week 1 - Niveau 2");
    assertEquals(navigation.modules[0].indexId, "lessons/week-1/weekintro-1");
    assertEquals(sidebars.docs[0].items, [
      "lessons/week-1/weekintro-1",
      "lessons/week-1/les-1.1",
      "lessons/week-1/quiz-1.1",
    ]);
    assertEquals(archive.isFile, true);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("bso lint reports navigation items missing from the manifest", async () => {
  const repoRoot = await Deno.makeTempDir();
  const reported: string[] = [];
  const originalError = console.error;
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(config.sourcesDir, { recursive: true });
    await Deno.writeTextFile(
      join(config.sourcesDir, "lesson.md"),
      "# Lesson\n",
    );
    await Deno.mkdir(config.outputDir, { recursive: true });
    await Deno.writeTextFile(
      join(config.outputDir, "navigation.json"),
      JSON.stringify({
        version: 1,
        modules: [{
          id: "week-1",
          title: "Week 1",
          indexId: null,
          items: [{
            kind: "lesson",
            docId: "lessons/week-1/lesson",
            href: "content/week-1/lesson.html",
            title: "Lesson",
            code: null,
            position: null,
          }],
        }],
      }),
    );
    await Deno.writeTextFile(
      join(config.outputDir, "docusaurus-sidebars.json"),
      JSON.stringify({
        docs: [{
          type: "category",
          label: "Week 1",
          items: ["lessons/week-1/lesson"],
        }],
      }),
    );
    await Deno.writeTextFile(
      join(config.outputDir, "imsmanifest.xml"),
      '<manifest><resource identifier="lesson" href="content/week-1/lesson.html"/></manifest>',
    );
    console.error = (...args: unknown[]) => reported.push(args.join(" "));
    await assertRejects(() => runLint(config), Error, "Course lint failed");
  } finally {
    console.error = originalError;
    await Deno.remove(repoRoot, { recursive: true });
  }
  assertStringIncludes(reported.join("\n"), "navigation-parity");
  assertStringIncludes(
    reported.join("\n"),
    "content/week-1/lesson.html is in navigation.json but not in imsmanifest.xml",
  );
});

Deno.test("runPrepare readers-only kopieert vooraf gebouwde PDF-readers zonder contentmanifest", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(config.sourcesDir, { recursive: true });
    await Deno.mkdir(config.readersDir!, { recursive: true });
    await Deno.writeFile(
      join(config.readersDir!, "reader-git.pdf"),
      new Uint8Array([37, 80, 68, 70]),
    );

    await runPrepare(config, true, { skipReaders: true });

    const copied = await Deno.readFile(
      join(config.outputDir, "readers", "reader-git.pdf"),
    );
    assertEquals([...copied], [37, 80, 68, 70]);

    try {
      await Deno.stat(join(config.outputDir, "imsmanifest.xml"));
      throw new Error("imsmanifest.xml should not exist");
    } catch (error) {
      assertEquals((error as Deno.errors.NotFound).name, "NotFound");
    }
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("runPreview geeft een duidelijke fout zonder docusaurusDir", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    try {
      await runPreview(config);
      throw new Error("preview should fail without docusaurusDir");
    } catch (error) {
      assertStringIncludes((error as Error).message, "docusaurusDir");
      assertEquals((error as Error & { exitCode?: number }).exitCode, 1);
    }
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("runPack names the package after the course version and writes it to outputDir (#42)", async () => {
  await Deno.mkdir("build", { recursive: true });
  const repoRoot = resolve(
    await Deno.makeTempDir({ dir: "build", prefix: "pack-" }),
  );
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(config.sourcesDir, { recursive: true });
    await Deno.writeTextFile(
      join(config.sourcesDir, "les-1.md"),
      "# Les 1\n\nTekst.\n",
    );
    await runPack(config);
    await runPack(config);

    const packageVersion = await loadPackageVersion();
    const names: string[] = [];
    for await (const entry of Deno.readDir(config.outputDir)) {
      if (entry.name.endsWith(".imscc")) names.push(entry.name);
    }
    assertEquals(names, ["coverage-course.v0.9.0.imscc"]);
    if (packageVersion !== "0.9.0") {
      assertEquals(
        names.includes(`coverage-course.v${packageVersion}.imscc`),
        false,
      );
    }

    const zip = await JSZip.loadAsync(
      await Deno.readFile(join(config.outputDir, names[0])),
    );
    const files = Object.keys(zip.files);
    assertEquals(files.some((file) => file.endsWith(".imscc")), false);
    assertEquals(files.includes("imsmanifest.xml"), true);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("--output overrides the build directory that receives the package", () => {
  const base = { courseName: "C", version: "1.2.3", sourcesDir: "lessons" };
  assertEquals(
    resolveConfig(base, { output: "dist/pkg" }, "/repo").outputDir,
    resolve("/repo", "dist/pkg"),
  );
  assertEquals(
    resolveConfig({ ...base, outputDir: "out" }, {}, "/repo").outputDir,
    resolve("/repo", "out"),
  );
  assertEquals(
    resolveConfig(base, {}, "/repo").outputDir,
    resolve("/repo", "build/brightspace"),
  );
});

Deno.test("preview installs the Docusaurus dependencies only when node_modules is missing", () => {
  assertEquals(previewInstallArgs(true, true), null);
  assertEquals(previewInstallArgs(true, false), null);
  assertEquals(previewInstallArgs(false, true), ["ci"]);
  assertEquals(previewInstallArgs(false, false), ["install"]);
});

Deno.test("preview adds the Docusaurus node_modules to NODE_PATH, keeping an existing value", () => {
  assertEquals(previewNodePath("/site"), "/site/node_modules");
  assertEquals(
    previewNodePath("/site", "/other"),
    `/site/node_modules${DELIMITER}/other`,
  );
});
