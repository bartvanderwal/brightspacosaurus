/**
 * Tests voor MarpExporter.
 *
 * Feature: brightspacosaurus
 * Valideert dat bestaande docentenslides als afgeleide Marp-Markdown kunnen worden geëxporteerd.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { convertSlidesToMarp, exportMarpSlides } from "../src/marp-exporter.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_marp_test_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

Deno.test("MarpExporter: voegt Marp-frontmatter toe en splitst Slide-koppen", () => {
  const source = `# Slides Les 2.1

## Slide 1 - Lesdoelen

- Doel A

## Slide 2 - Demo

\`\`\`plantuml
@startuml
A --> B
@enduml
\`\`\`

### Speaker notes - Slide 2

- Vraag studenten wat ze zien.

---
`;

  const result = convertSlidesToMarp(source);

  assertStringIncludes(result, "marp: true");
  assertStringIncludes(result, "# Lesdoelen");
  assertStringIncludes(result, "---\n\n# Demo");
  assertStringIncludes(result, "```plantuml");
  assertStringIncludes(result, "<!--\nSpeaker notes:");
  assertEquals(result.includes("Speaker notes:\n- Vraag studenten wat ze zien.\n\n---"), false);
});

Deno.test("MarpExporter: exporteert alle slides-les-bestanden naar build-structuur", async () => {
  const tempRoot = await makeTempDir();
  try {
    const sourceDir = join(tempRoot, "docenten");
    const outputDir = join(tempRoot, "build", "marp-slides");
    const slideDir = join(sourceDir, "week-2", "les-1");
    await Deno.mkdir(slideDir, { recursive: true });
    await Deno.writeTextFile(
      join(slideDir, "slides-les-2.1.md"),
      "# Slides\n\n## Slide 1 - Intro\n\nSpreeknotitie docent:\n\n- Start rustig.\n",
    );

    const result = await exportMarpSlides({
      sourceDir,
      outputDir,
      repoRoot: tempRoot,
    });

    assertEquals(result.exportedFiles.length, 1);
    const exported = await Deno.readTextFile(result.exportedFiles[0]);
    assertStringIncludes(exported, "marp: true");
    assertStringIncludes(exported, "# Intro");
    assertStringIncludes(exported, "Speaker notes:");
  } finally {
    await removeDir(tempRoot);
  }
});
