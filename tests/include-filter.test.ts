import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join, resolve } from "@std/path";
import { withoutOverviewSections } from "../src/menu-overview.ts";

const testDir = dirname(fromFileUrl(import.meta.url));
const filterPath = join(testDir, "..", "assets", "include-filter.lua");

async function runPandoc(sourcePath: string): Promise<Deno.CommandOutput> {
  return await new Deno.Command("pandoc", {
    args: [sourcePath, `--lua-filter=${filterPath}`, "--to=markdown"],
    stdout: "piped",
    stderr: "piped",
  }).output();
}

// Spec *Menu order*, rule O2a.
Deno.test("O2a: a reader include uses the lead page without its hidden overview", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({ dir: resolve("build"), prefix: "overview-pdf-" });
  try {
    const intro = join(root, "index.md");
    const reader = join(root, "reader.md");
    const map = join(root, "overviews.json");
    const source = "# Week\n\nIntroduction.\n\n## Overview\n\n- [Lesson](lesson.md)\n\n## After\n\nPreserved.\n";
    await Deno.writeTextFile(intro, source);
    await Deno.writeTextFile(reader, "{@include: [Week](index.md)}\n");
    await Deno.writeTextFile(map, JSON.stringify({ sources: { [intro]: withoutOverviewSections(source, ["Overview"]) } }));
    const result = await new Deno.Command("pandoc", {
      args: [reader, `--lua-filter=${filterPath}`, "--to=markdown"],
      env: { BSO_HIDDEN_OVERVIEWS: map },
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(result.success, true, new TextDecoder().decode(result.stderr));
    const output = new TextDecoder().decode(result.stdout);
    assertStringIncludes(output, "Introduction.");
    assertStringIncludes(output, "Preserved.");
    assertEquals(output.includes("Overview"), false);
    assertEquals(output.includes("lesson.md"), false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test({
  name: "include-filter voegt Markdown relatief aan het bronbestand in",
  permissions: { read: true, write: true, run: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ prefix: "include_filter_" });
    const partialDir = join(tempDir, "partials");
    const sourceDir = join(tempDir, "hoofdstukken");

    try {
      await Deno.mkdir(partialDir);
      await Deno.mkdir(sourceDir);
      await Deno.writeTextFile(
        join(partialDir, "lesdoelen.md"),
        "- Eerste lesdoel\n- Tweede lesdoel met `code`\n",
      );
      const sourcePath = join(sourceDir, "les.md");
      await Deno.writeTextFile(
        sourcePath,
        "# Les\n\n{@include: [Lesdoelen](../partials/lesdoelen.md)}\n\nAfsluiting.\n",
      );

      const result = await runPandoc(sourcePath);
      const output = new TextDecoder().decode(result.stdout);
      const errorOutput = new TextDecoder().decode(result.stderr);

      assertEquals(result.success, true, errorOutput);
      assertStringIncludes(output, "- Eerste lesdoel");
      assertStringIncludes(output, "- Tweede lesdoel met `code`");
      assertEquals(output.includes("{@include:"), false);
      assertEquals(output.includes("Lesdoelen"), false);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "include-filter faalt bij een ontbrekend include-bestand",
  permissions: { read: true, write: true, run: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({
      prefix: "include_filter_missing_",
    });

    try {
      const sourcePath = join(tempDir, "les.md");
      await Deno.writeTextFile(
        sourcePath,
        "{@include: [Ontbrekend](ontbreekt.md)}\n",
      );

      const result = await runPandoc(sourcePath);
      const errorOutput = new TextDecoder().decode(result.stderr);

      assertEquals(result.success, false);
      assertStringIncludes(
        errorOutput,
        "include-filter: kan bestand niet lezen",
      );
      assertStringIncludes(errorOutput, "ontbreekt.md");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

// ===========================================================================
// {@include} vereist Markdown-linksyntax (issue #26, breaking change)
// De oude padvorm {@include: relatief/pad.md} geeft nu een duidelijke fout,
// zodat elke include-target in de brontekst klikbaar blijft.
// ===========================================================================

Deno.test({
  name: "include-filter geeft een foutmelding bij de oude padvorm zonder Markdown-link",
  permissions: { read: true, write: true, run: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({
      prefix: "include_filter_legacy_",
    });

    try {
      const sourcePath = join(tempDir, "les.md");
      await Deno.writeTextFile(
        sourcePath,
        "# Les\n\n{@include: partials/lesdoelen.md}\n",
      );

      const result = await runPandoc(sourcePath);
      const errorOutput = new TextDecoder().decode(result.stderr);

      assertEquals(result.success, false);
      assertStringIncludes(
        errorOutput,
        "include-filter: {@include: ...} vereist Markdown-linksyntax",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});
