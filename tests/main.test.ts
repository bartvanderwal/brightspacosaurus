import { assertEquals, assertStringIncludes } from "@std/assert";
import { DELIMITER, join, resolve } from "@std/path";
import JSZip from "jszip";
import { resolveConfig } from "../src/config-loader.ts";
import {
  buildUsage,
  decodeHtmlEntities,
  parseArgs,
  unknownCommandMessage,
  runPack,
  runBuild,
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
      "build",
      "--sources",
      "src",
      "--readers-only",
      "--output",
      "out",
      "--config",
      "bso.json",
    ]),
    {
      command: "build",
      sources: "src",
      readersOnly: true,
      skipReaders: false,
      skipSlides: false,
      output: "out",
      config: "bso.json",
    },
  );
  assertEquals(parseArgs(["pack", "--name", "legacy-name"]), {
    command: "pack",
    sources: "",
    readersOnly: false,
    skipReaders: false,
    skipSlides: false,
    output: "legacy-name",
    config: "",
  });
  assertEquals(parseArgs(["build", "--skip-readers"])?.skipReaders, true);
  assertEquals(parseArgs(["build", "--skip-slides"])?.skipSlides, true);
  assertEquals(parseArgs(["prepare", "--skip-readers"]), null);
  assertStringIncludes(buildUsage("0.9.0"), "build     Generate Brightspace HTML, QTI quizzes, PDFs and assets");
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

Deno.test("runBuild with skipReaders converts no reader Markdown but still copies pre-built PDFs", async () => {
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

    await runBuild(config, false, { skipReaders: true });

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
  assertEquals(
    unknownCommandMessage(["prepare"]),
    "Command 'prepare' was renamed to 'build' in BSO 0.23.0.\nUse 'bso build' or 'deno task build' instead.",
  );
  for (const command of ["build", "pack", "preview", "lint"]) {
    assertEquals(unknownCommandMessage([command]), null);
  }
  assertEquals(unknownCommandMessage([]), null);
  assertEquals(unknownCommandMessage(["--help"]), null);
  assertEquals(unknownCommandMessage(["-v"]), null);
});

Deno.test("runBuild en runPack bouwen een minimale cartridge met lessen, quiz en reader", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(join(config.sourcesDir, "week-1"), { recursive: true });
    await Deno.mkdir(config.readersDir!, { recursive: true });
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "les-1.1.md"),
      "# Les 1.1 & intro\n\n![plaatje](image.png)\n\n[Download starter](starter.zip)\n\n## Kernbegrippen\n\n- **request:** Bericht van een client.\n",
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
      join(config.sourcesDir, "week-1", "starter.zip"),
      new Uint8Array([7, 8, 9]),
    );
    await Deno.writeFile(
      join(config.readersDir!, "reader-plantuml-essentials.pdf"),
      new Uint8Array([37, 80, 68, 70]),
    );

    await runBuild(config, false, { skipReaders: true });
    await runPack(config);

    const html = await Deno.readTextFile(
      join(config.outputDir, "content", "week-1", "les-1.1.html"),
    );
    const manifest = await Deno.readTextFile(
      join(config.outputDir, "imsmanifest.xml"),
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
    assertEquals(archive.isFile, true);
    assertStringIncludes(manifest, '<file href="content/week-1/starter.zip"/>');
    const packageZip = await JSZip.loadAsync(
      await Deno.readFile(
        join(config.outputDir, "coverage-course.v0.9.0.imscc"),
      ),
    );
    assertEquals(
      [
        ...await packageZip.file("content/week-1/starter.zip")!.async(
          "uint8array",
        ),
      ],
      [7, 8, 9],
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("runBuild groups the parent README with the first topic folder", async () => {
  await Deno.mkdir("build", { recursive: true });
  const repoRoot = await Deno.makeTempDir({
    dir: "build",
    prefix: "topic-menu-",
  });
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(join(config.sourcesDir, "topic-intro"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, "README.md"),
      "# Course overview\n",
    );
    await Deno.writeTextFile(
      join(config.sourcesDir, "topic-intro", "index.md"),
      "# Introduction\n",
    );
    await runBuild(config, false, { skipReaders: true });
    assertEquals(
      await Deno.stat(
        join(config.outputDir, "content", "topic-intro", "README.html"),
      ).then((stat) => stat.isFile),
      true,
    );
    assertEquals(
      await exists(join(config.outputDir, "content", "week-1")),
      false,
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("runBuild readers-only kopieert vooraf gebouwde PDF-readers zonder contentmanifest", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(config.sourcesDir, { recursive: true });
    await Deno.mkdir(config.readersDir!, { recursive: true });
    await Deno.writeFile(
      join(config.readersDir!, "reader-git.pdf"),
      new Uint8Array([37, 80, 68, 70]),
    );

    await runBuild(config, true, { skipReaders: true });

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

Deno.test("runPack lists a slide deck by its bso-title, after its lesson, without treating data: URIs as files (#112)", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(join(config.sourcesDir, "week-1"), { recursive: true });
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "lesson.md"),
      "# Lesson 1.1: FizzBuzz\n",
    );
    await runBuild(config, false, { skipReaders: true });
    await Deno.writeTextFile(
      join(config.outputDir, "content", "week-1", "lesson-slides.html"),
      '<html><head><meta name="bso-title" content="Slides: Lesson 1.1: FizzBuzz"></head><body><h1>First slide</h1><img src="data:image/png;base64,AAAA/BB=="></body></html>',
    );
    await runPack(config);

    const packageFile = join(
      config.outputDir,
      `${config.name}.v${config.version}.imscc`,
    );
    const zip = await JSZip.loadAsync(await Deno.readFile(packageFile));
    const manifest = await zip.file("imsmanifest.xml")!.async("string");
    assertStringIncludes(manifest, "<title>Slides: Lesson 1.1: FizzBuzz</title>");
    assertEquals(manifest.includes("First slide"), false);
    assertEquals(manifest.includes("data:image"), false);
    assertEquals(
      manifest.indexOf("<title>Lesson 1.1: FizzBuzz</title>") <
        manifest.indexOf("<title>Slides: Lesson 1.1: FizzBuzz</title>"),
      true,
    );
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});
