import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import {
  buildUsage,
  decodeHtmlEntities,
  parseArgs,
  runPack,
  runPrepare,
  runPreview,
} from "../src/main.ts";
import { ResolvedConfig } from "../src/types.ts";

function testConfig(repoRoot: string): ResolvedConfig {
  return {
    repoRoot,
    sourcesDir: join(repoRoot, "lessons"),
    readersDir: join(repoRoot, "readers"),
    assetsDir: null,
    outputDir: join(repoRoot, "build", "brightspace"),
    courseName: "Coverage Course",
    version: "0.9.0",
    customCss: null,
    name: "coverage-course",
    docusaurusDir: null,
    teacherManual: null,
    quiz: { maxAttempts: 0 },
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
      output: "out",
      config: "bso.json",
    },
  );
  assertEquals(parseArgs(["pack", "--name", "legacy-name"]), {
    command: "pack",
    sources: "",
    readersOnly: false,
    output: "legacy-name",
    config: "",
  });
  assertEquals(parseArgs(["nope"]), null);
});

Deno.test("runPrepare en runPack bouwen een minimale cartridge met lessen, quiz en reader", async () => {
  const repoRoot = await Deno.makeTempDir();
  try {
    const config = testConfig(repoRoot);
    await Deno.mkdir(join(config.sourcesDir, "week-1"), { recursive: true });
    await Deno.mkdir(config.readersDir!, { recursive: true });
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "les-1.1.md"),
      "# Les 1.1 & intro\n\n![plaatje](image.png)\n",
    );
    await Deno.writeTextFile(
      join(config.sourcesDir, "week-1", "quiz-1.1.md"),
      "# Quiz 1.1\n\n## Vraag 1\n\nWat klopt?\n\n- [x] Ja\n- [ ] Nee\n",
    );
    await Deno.writeFile(
      join(config.sourcesDir, "week-1", "image.png"),
      new Uint8Array([1, 2, 3]),
    );
    await Deno.writeFile(
      join(config.readersDir!, "reader-plantuml-essentials.pdf"),
      new Uint8Array([37, 80, 68, 70]),
    );

    await runPrepare(config, false);
    await runPack(config);

    const html = await Deno.readTextFile(
      join(config.outputDir, "content", "week-1", "les-1.1.html"),
    );
    const manifest = await Deno.readTextFile(
      join(config.outputDir, "imsmanifest.xml"),
    );
    const archive = await Deno.stat(
      join(repoRoot, "build", "coverage-course.v0.9.0.imscc"),
    );

    assertStringIncludes(html, "<h1>Les 1.1 &#x26; intro</h1>");
    assertStringIncludes(manifest, "<title>Les 1.1 &amp; intro</title>");
    assertEquals(
      manifest.includes("<title>Les 1.1 &#x26; intro</title>"),
      false,
    );
    assertEquals(manifest.includes("&amp;amp;"), false);
    assertStringIncludes(manifest, "<title>Quiz 1.1</title>");
    assertStringIncludes(manifest, "<title>Reader PlantUML essentials</title>");
    assertEquals(archive.isFile, true);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
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

    await runPrepare(config, true);

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
