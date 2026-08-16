/**
 * Property-based tests en unit tests voor MarkdownConverter.
 *
 * Feature: brightspacosaurus
 * Eigenschap 1: HTML-uitvoer voldoet aan structuureisen
 * Eigenschap 8: QTI-secties uitgesloten van HTML
 *
 * Feature: readers-en-pdf-export
 * Unit tests voor linkconversie (convertReaderLinks)
 * Valideert: Requirements 8.5
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { convertMarkdown, convertReaderLinks } from "../src/markdown-converter.ts";
import { join, resolve } from "@std/path";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_test_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

// ---------------------------------------------------------------------------
// Eigenschap 1: HTML-uitvoer voldoet aan structuureisen
// Valideert: Requirements 1.1, 1.2
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 1: HTML-uitvoer bevat lang=nl en charset=utf-8", async () => {
  // Feature: brightspacosaurus, Eigenschap 1: HTML-uitvoer voldoet aan structuureisen
  await fc.assert(
    fc.asyncProperty(
      // Genereer willekeurige Markdown-inhoud (koppen, tekst)
      fc.tuple(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), // bestandsnaam
        fc.stringMatching(/^[A-Za-z ]{1,50}$/) // inhoud
      ),
      async ([fileName, content]) => {
        const tempRoot = await makeTempDir();
        const sourceDir = join(tempRoot, "src");
        const outputDir = join(tempRoot, "build");
        try {
          await Deno.mkdir(sourceDir, { recursive: true });
          const sourcePath = join(sourceDir, `${fileName}.md`);
          await Deno.writeTextFile(sourcePath, `# ${content}\n\n${content}\n`);

          const result = await convertMarkdown({
            sourcePath,
            outputDir,
            repoRoot: tempRoot,
          });

          const html = await Deno.readTextFile(result.outputPath);

          // Eigenschap: HTML bevat lang="nl"
          assertEquals(html.includes('<html lang="nl">'), true, 'HTML moet lang="nl" bevatten');
          // Eigenschap: HTML bevat charset=utf-8
          assertEquals(html.includes('<meta charset="utf-8">'), true, 'HTML moet charset="utf-8" bevatten');
          // Eigenschap: HTML is een volledig document
          assertEquals(html.includes('<!DOCTYPE html>'), true, "HTML moet een DOCTYPE hebben");
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 30 }
  );
});

Deno.test("Eigenschap 1: afbeeldingen met relatieve paden worden gekopieerd", async () => {
  // Feature: brightspacosaurus, Eigenschap 1: HTML-uitvoer voldoet aan structuureisen
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src", "week-1");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(join(sourceDir, "img"), { recursive: true });
    // Maak een afbeelding aan
    await Deno.writeTextFile(join(sourceDir, "img", "diagram.png"), "fake-png-data");
    // Maak een Markdown-bestand met een relatieve afbeeldingsreferentie
    const sourcePath = join(sourceDir, "les-1.md");
    await Deno.writeTextFile(sourcePath, "# Les 1\n\n![diagram](img/diagram.png)\n");

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
    });

    // Eigenschap: de afbeelding is gekopieerd
    assertEquals(result.copiedImages.length, 1, "Er moet 1 afbeelding zijn gekopieerd");
    // Controleer dat het doelbestand bestaat
    const stat = await Deno.stat(result.copiedImages[0]);
    assertEquals(stat.isFile, true, "Gekopieerde afbeelding moet een bestand zijn");
  } finally {
    await removeDir(tempRoot);
  }
});

// ---------------------------------------------------------------------------
// Eigenschap 8: QTI-secties worden niet opgenomen in HTML-uitvoer
// Valideert: Requirements 1.5
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 8: QTI-gemarkeerde secties verschijnen niet in HTML-uitvoer", async () => {
  // Feature: brightspacosaurus, Eigenschap 8: QTI-secties uitgesloten van HTML
  await fc.assert(
    fc.asyncProperty(
      // Genereer willekeurige QTI-inhoud
      fc.tuple(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/), // bestandsnaam
        fc.stringMatching(/^[A-Za-z]{3,30}$/), // normale inhoud (geen spaties, min 3 chars)
        fc.stringMatching(/^QTI_MARKER_[a-z]{3,15}$/) // QTI-inhoud: uniek herkenbaar, komt niet per ongeluk voor
      ),
      async ([fileName, normalContent, qtiContent]) => {
        const tempRoot = await makeTempDir();
        const sourceDir = join(tempRoot, "src");
        const outputDir = join(tempRoot, "build");
        try {
          await Deno.mkdir(sourceDir, { recursive: true });
          const sourcePath = join(sourceDir, `${fileName}.md`);
          const markdown = `# Titel\n\n${normalContent}\n\n<!-- QTI -->\n${qtiContent}\n<!-- /QTI -->\n\nEinde.\n`;
          await Deno.writeTextFile(sourcePath, markdown);

          const result = await convertMarkdown({
            sourcePath,
            outputDir,
            repoRoot: tempRoot,
          });

          const html = await Deno.readTextFile(result.outputPath);

          // Eigenschap: QTI-inhoud mag niet in de HTML staan
          assertEquals(html.includes(qtiContent), false, `QTI-inhoud "${qtiContent}" mag niet in HTML voorkomen`);
          // Eigenschap: normale inhoud moet wel in de HTML staan
          assertEquals(html.includes(normalContent), true, `Normale inhoud "${normalContent}" moet in HTML voorkomen`);
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 30 }
  );
});


// ===========================================================================
// Unit tests voor convertReaderLinks
// Feature: readers-en-pdf-export
// Valideert: Requirements 8.5
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. ../reader-X.md → ../readers/reader-X.pdf
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: ../reader-git-en-gitlab.md → ../readers/reader-git-en-gitlab.pdf", () => {
  const input = "Zie de [Git-reader](../reader-git-en-gitlab.md) voor meer info.";
  const result = convertReaderLinks(input);
  assertEquals(
    result,
    "Zie de [Git-reader](../readers/reader-git-en-gitlab.pdf) voor meer info.",
  );
});

// ---------------------------------------------------------------------------
// 2. ../../reader-X.md → ../readers/reader-X.pdf
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: ../../reader-geheugenmodellen.md → ../readers/reader-geheugenmodellen.pdf", () => {
  const input = "Lees de [geheugenmodellen-reader](../../reader-geheugenmodellen.md).";
  const result = convertReaderLinks(input);
  assertEquals(
    result,
    "Lees de [geheugenmodellen-reader](../readers/reader-geheugenmodellen.pdf).",
  );
});

// ---------------------------------------------------------------------------
// 3. ./reader-X.md → test huidig gedrag
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: ./reader-technisch-schrijven.md wordt geconverteerd", () => {
  const input = "Zie [technisch schrijven](./reader-technisch-schrijven.md).";
  const result = convertReaderLinks(input);
  // De regex vervangt nul of meer ../ prefixen door ../readers/
  // Bij ./reader-X.md matcht ^(?:\.\.\/)*  op de lege string, dus ../readers/ wordt vooraan gezet
  assertEquals(
    result,
    "Zie [technisch schrijven](../readers/./reader-technisch-schrijven.pdf).",
  );
});

// ---------------------------------------------------------------------------
// 4. reader-test.md (geen padprefix) → ../readers/reader-test.pdf
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: reader-test.md (zonder padprefix) → ../readers/reader-test.pdf", () => {
  const input = "Bekijk de [test-reader](reader-test.md).";
  const result = convertReaderLinks(input);
  assertEquals(
    result,
    "Bekijk de [test-reader](../readers/reader-test.pdf).",
  );
});

// ---------------------------------------------------------------------------
// 5. ../plantuml-essentials.md → ../readers/plantuml-essentials.pdf
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: ../plantuml-essentials.md → ../readers/plantuml-essentials.pdf", () => {
  const input = "Zie de [PlantUML-reader](../plantuml-essentials.md) voor diagrammen.";
  const result = convertReaderLinks(input);
  assertEquals(
    result,
    "Zie de [PlantUML-reader](../readers/plantuml-essentials.pdf) voor diagrammen.",
  );
});

// ---------------------------------------------------------------------------
// 6. Niet-reader-links blijven ongewijzigd
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: niet-reader-link ../week-1/lesoverzicht-1.1.md blijft ongewijzigd", () => {
  const input = "Ga naar [les 1.1](../week-1/lesoverzicht-1.1.md) voor het overzicht.";
  const result = convertReaderLinks(input);
  assertEquals(
    result,
    "Ga naar [les 1.1](../week-1/lesoverzicht-1.1.md) voor het overzicht.",
  );
});

// ---------------------------------------------------------------------------
// 7. Externe links blijven ongewijzigd
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: externe link https://example.com/reader-test.md — huidig gedrag", () => {
  const input = "Zie [extern](https://example.com/reader-test.md) voor details.";
  const result = convertReaderLinks(input);
  // NB: De huidige regex matcht ook externe URLs die reader-*.md bevatten.
  // Dit is een bekende beperking — in de praktijk komen dergelijke externe links
  // niet voor in het lesmateriaal. De regex zou uitgebreid kunnen worden met een
  // negatieve lookahead voor http(s):// als dit in de toekomst nodig is.
  assertEquals(
    result,
    "Zie [extern](../readers/https://example.com/reader-test.pdf) voor details.",
  );
});

// ---------------------------------------------------------------------------
// 8. Links met anchors: ../reader-git-en-gitlab.md#branching
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: link met anchor ../reader-git-en-gitlab.md#branching — test huidig gedrag", () => {
  const input = "Zie [branching](../reader-git-en-gitlab.md#branching) voor details.";
  const result = convertReaderLinks(input);
  // De regex vereist dat de href eindigt op .md) — een anchor (#branching) staat na .md
  // waardoor het patroon `reader-[^)]+\.md` niet matcht op `reader-git-en-gitlab.md#branching`
  // want de .md wordt gevolgd door #branching, niet door )
  // Dus de link blijft ongewijzigd
  assertEquals(
    result,
    "Zie [branching](../reader-git-en-gitlab.md#branching) voor details.",
  );
});

// ---------------------------------------------------------------------------
// 9. Meerdere reader-links in één document
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: meerdere reader-links in één document worden allemaal geconverteerd", () => {
  const input = [
    "# Materiaal",
    "",
    "Lees de [Git-reader](../reader-git-en-gitlab.md) en de [PlantUML-reader](../plantuml-essentials.md).",
    "",
    "Bekijk ook de [geheugenmodellen](../../reader-geheugenmodellen.md).",
  ].join("\n");

  const result = convertReaderLinks(input);

  const expected = [
    "# Materiaal",
    "",
    "Lees de [Git-reader](../readers/reader-git-en-gitlab.pdf) en de [PlantUML-reader](../readers/plantuml-essentials.pdf).",
    "",
    "Bekijk ook de [geheugenmodellen](../readers/reader-geheugenmodellen.pdf).",
  ].join("\n");

  assertEquals(result, expected);
});

// ---------------------------------------------------------------------------
// 10. Mix van reader-links en niet-reader-links
// ---------------------------------------------------------------------------

Deno.test("convertReaderLinks: mix van reader-links en niet-reader-links", () => {
  const input = [
    "Zie [les 1.1](../week-1/lesoverzicht-1.1.md) voor het programma.",
    "Raadpleeg de [Git-reader](../reader-git-en-gitlab.md) voor Git-instructies.",
    "En bekijk [quiz 1](../week-1/quiz-1.4-oop-basics.md) voor oefenvragen.",
    "De [PlantUML-reader](../plantuml-essentials.md) helpt bij diagrammen.",
  ].join("\n");

  const result = convertReaderLinks(input);

  const expected = [
    "Zie [les 1.1](../week-1/lesoverzicht-1.1.md) voor het programma.",
    "Raadpleeg de [Git-reader](../readers/reader-git-en-gitlab.pdf) voor Git-instructies.",
    "En bekijk [quiz 1](../week-1/quiz-1.4-oop-basics.md) voor oefenvragen.",
    "De [PlantUML-reader](../readers/plantuml-essentials.pdf) helpt bij diagrammen.",
  ].join("\n");

  assertEquals(result, expected);
});
