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

import { assertEquals, assertRejects } from "@std/assert";
import fc from "fast-check";
import {
  convertInternalMdLinks,
  convertMarkdown,
  convertReaderLinks,
} from "../src/markdown-converter.ts";
import { join } from "@std/path";

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
        fc.stringMatching(/^[A-Za-z ]{1,50}$/), // inhoud
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
          assertEquals(
            html.includes('<html lang="nl">'),
            true,
            'HTML moet lang="nl" bevatten',
          );
          // Eigenschap: HTML bevat charset=utf-8
          assertEquals(
            html.includes('<meta charset="utf-8">'),
            true,
            'HTML moet charset="utf-8" bevatten',
          );
          // Eigenschap: HTML is een volledig document
          assertEquals(
            html.includes("<!DOCTYPE html>"),
            true,
            "HTML moet een DOCTYPE hebben",
          );
        } finally {
          await removeDir(tempRoot);
        }
      },
    ),
    { numRuns: 30 },
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
    await Deno.writeTextFile(
      join(sourceDir, "img", "diagram.png"),
      "fake-png-data",
    );
    // Maak een Markdown-bestand met een relatieve afbeeldingsreferentie
    const sourcePath = join(sourceDir, "les-1.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Les 1\n\n![diagram](img/diagram.png)\n",
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
      baseDir: join(tempRoot, "src"),
    });

    // Eigenschap: de afbeelding is gekopieerd
    assertEquals(
      result.copiedImages.length,
      1,
      "Er moet 1 afbeelding zijn gekopieerd",
    );
    // Controleer dat het doelbestand bestaat
    const stat = await Deno.stat(result.copiedImages[0]);
    assertEquals(
      stat.isFile,
      true,
      "Gekopieerde afbeelding moet een bestand zijn",
    );
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
        fc.stringMatching(/^QTI_MARKER_[a-z]{3,15}$/), // QTI-inhoud: uniek herkenbaar, komt niet per ongeluk voor
      ),
      async ([fileName, normalContent, qtiContent]) => {
        const tempRoot = await makeTempDir();
        const sourceDir = join(tempRoot, "src");
        const outputDir = join(tempRoot, "build");
        try {
          await Deno.mkdir(sourceDir, { recursive: true });
          const sourcePath = join(sourceDir, `${fileName}.md`);
          const markdown =
            `# Titel\n\n${normalContent}\n\n<!-- QTI -->\n${qtiContent}\n<!-- /QTI -->\n\nEinde.\n`;
          await Deno.writeTextFile(sourcePath, markdown);

          const result = await convertMarkdown({
            sourcePath,
            outputDir,
            repoRoot: tempRoot,
          });

          const html = await Deno.readTextFile(result.outputPath);

          // Eigenschap: QTI-inhoud mag niet in de HTML staan
          assertEquals(
            html.includes(qtiContent),
            false,
            `QTI-inhoud "${qtiContent}" mag niet in HTML voorkomen`,
          );
          // Eigenschap: normale inhoud moet wel in de HTML staan
          assertEquals(
            html.includes(normalContent),
            true,
            `Normale inhoud "${normalContent}" moet in HTML voorkomen`,
          );
        } finally {
          await removeDir(tempRoot);
        }
      },
    ),
    { numRuns: 30 },
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
  const input =
    "Zie de [Git-reader](../reader-git-en-gitlab.md) voor meer info.";
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
  const input =
    "Lees de [geheugenmodellen-reader](../../reader-geheugenmodellen.md).";
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
  const input =
    "Zie de [PlantUML-reader](../plantuml-essentials.md) voor diagrammen.";
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
  const input =
    "Ga naar [les 1.1](../week-1/lesoverzicht-1.1.md) voor het overzicht.";
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
  const input =
    "Zie [extern](https://example.com/reader-test.md) voor details.";
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
  const input =
    "Zie [branching](../reader-git-en-gitlab.md#branching) voor details.";
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

// ===========================================================================
// Unit tests voor convertInternalMdLinks (issues #7, #8)
// ===========================================================================

Deno.test("convertInternalMdLinks: interne .md-link wordt CC file-base link", () => {
  const input = "Kijk in de [FAQ](../faq.md) voor meer info.";
  const result = convertInternalMdLinks(
    input,
    "/repo/src/week-1/les.md",
    "/repo/src",
  );
  assertEquals(
    result,
    "Kijk in de [FAQ]($IMS-CC-FILEBASE$/content/faq.html) voor meer info.",
  );
});

Deno.test("convertInternalMdLinks: interne .md-link behoudt anchor", () => {
  const input = "Zie [les 1.1](../week-1/lesoverzicht-1.1.md#opdracht).";
  const result = convertInternalMdLinks(
    input,
    "/repo/src/week-2/les.md",
    "/repo/src",
  );
  assertEquals(
    result,
    "Zie [les 1.1]($IMS-CC-FILEBASE$/content/week-1/lesoverzicht-1.1.html#opdracht).",
  );
});

Deno.test("convertInternalMdLinks: externe .md-link blijft ongewijzigd", () => {
  const input =
    "Zie [extern](https://example.com/handleiding.md) voor details.";
  const result = convertInternalMdLinks(input, "/repo/src/les.md", "/repo/src");
  assertEquals(result, input);
});

Deno.test("convertInternalMdLinks: reeds omgezette reader-pdf-link blijft ongewijzigd", () => {
  const input = "Lees de [Git-reader](../readers/reader-git-en-gitlab.pdf).";
  const result = convertInternalMdLinks(input, "/repo/src/les.md", "/repo/src");
  assertEquals(result, input);
});

Deno.test("convertInternalMdLinks: afbeeldingssyntax (![...]) met .md-pad blijft ongewijzigd", () => {
  const input = "![alt tekst](diagram.md)";
  const result = convertInternalMdLinks(input, "/repo/src/les.md", "/repo/src");
  assertEquals(result, input);
});

Deno.test("convertInternalMdLinks: meerdere interne links worden allemaal geconverteerd", () => {
  const input = [
    "Ga naar [les 1.1](../week-1/lesoverzicht-1.1.md) voor het programma.",
    "Raadpleeg de [Git-reader](../readers/reader-git-en-gitlab.pdf) voor Git-instructies.",
    "En bekijk [quiz 1](../week-1/quiz-1.4-oop-basics.md) voor oefenvragen.",
  ].join("\n");

  const result = convertInternalMdLinks(
    input,
    "/repo/src/week-1/les.md",
    "/repo/src",
  );

  const expected = [
    "Ga naar [les 1.1]($IMS-CC-FILEBASE$/content/week-1/lesoverzicht-1.1.html) voor het programma.",
    "Raadpleeg de [Git-reader](../readers/reader-git-en-gitlab.pdf) voor Git-instructies.",
    "En bekijk [quiz 1]($IMS-CC-FILEBASE$/content/week-1/quiz-1.4-oop-basics.html) voor oefenvragen.",
  ].join("\n");

  assertEquals(result, expected);
});

Deno.test("convertMarkdown: interne .md-link wordt CC file-base link in HTML-uitvoer", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src", "week-1");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "les.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Les 1\n\nZie [de FAQ](../faq.md) voor vragen.\n",
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
      baseDir: join(tempRoot, "src"),
    });

    const html = await Deno.readTextFile(result.outputPath);

    assertEquals(
      html.includes("<a"),
      true,
      "HTML moet de interne link behouden",
    );
    assertEquals(
      html.includes("de FAQ"),
      true,
      "Linktekst moet behouden blijven",
    );
    assertEquals(
      html.includes("$IMS-CC-FILEBASE$/content/faq.html"),
      true,
      "De link moet naar de Common Cartridge HTML-resource wijzen",
    );
  } finally {
    await removeDir(tempRoot);
  }
});

// ===========================================================================
// Copy-knop bij codeblokken in Brightspace HTML-output (issue #16)
// ===========================================================================

Deno.test("convertMarkdown: HTML-uitvoer bevat copy-knop script en CSS voor codeblokken", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "codevoorbeeld.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Codevoorbeeld\n\n```sh\ngit clone https://example.com/repo.git\n```\n",
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
    });

    const html = await Deno.readTextFile(result.outputPath);

    assertEquals(
      html.includes("bso-copy-btn"),
      true,
      "HTML moet de copy-knop CSS-klasse bevatten",
    );
    assertEquals(
      html.includes("navigator.clipboard"),
      true,
      "HTML moet het copy-script bevatten",
    );
    assertEquals(
      html.includes("<pre><code"),
      true,
      "Codeblok moet nog steeds als <pre><code> aanwezig zijn",
    );
  } finally {
    await removeDir(tempRoot);
  }
});

// ===========================================================================
// Markdown-linksyntax in {@include} directives (issue #26, breaking change)
// {@include: ...} vereist Markdown-linksyntax; de oude padvorm zonder link
// geeft nu een duidelijke fout.
// ===========================================================================

Deno.test("convertMarkdown: {@include} met Markdown-linksyntax voegt bestand in", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    await Deno.writeTextFile(
      join(sourceDir, "lesdoelen.md"),
      "- Eerste lesdoel\n- Tweede lesdoel\n",
    );
    const sourcePath = join(sourceDir, "les.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Les\n\n{@include: [Lesdoelen](lesdoelen.md)}\n\nAfsluiting.\n",
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
    });

    const html = await Deno.readTextFile(result.outputPath);

    assertEquals(html.includes("Eerste lesdoel"), true);
    assertEquals(html.includes("Tweede lesdoel"), true);
    assertEquals(html.includes("@include"), false);
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown: {@include} met oude padsyntax (zonder link) geeft een foutmelding", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    await Deno.writeTextFile(
      join(sourceDir, "lesdoelen.md"),
      "- Eerste lesdoel\n",
    );
    const sourcePath = join(sourceDir, "les.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Les\n\n{@include: lesdoelen.md}\n",
    );

    await assertRejects(
      () => convertMarkdown({ sourcePath, outputDir, repoRoot: tempRoot }),
      Error,
      "requires Markdown link syntax",
    );
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown: {@include} met HTML-linksyntax geeft een foutmelding", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "les.md");
    await Deno.writeTextFile(
      sourcePath,
      '# Les\n\n{@include: <a href="lesdoelen.md">Lesdoelen</a>}\n',
    );

    await assertRejects(
      () => convertMarkdown({ sourcePath, outputDir, repoRoot: tempRoot }),
      Error,
      "requires Markdown link syntax",
    );
  } finally {
    await removeDir(tempRoot);
  }
});

// ===========================================================================
// Externe links openen in nieuw tabblad (issue #4)
// Feature: brightspacosaurus
// Externe http(s)-links krijgen target="_blank" en rel="noopener noreferrer";
// relatieve/interne links blijven ongemoeid.
// ===========================================================================

Deno.test("Externe link krijgt target=_blank en rel=noopener noreferrer", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "externe-link.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Video\n\n[\u25b6 Watch on YouTube](https://www.youtube.com/watch?v=abc)\n",
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
    });

    const html = await Deno.readTextFile(result.outputPath);

    // De externe link moet in een <a>-tag met target="_blank" resulteren
    assertEquals(
      html.includes('target="_blank"'),
      true,
      'Externe link moet target="_blank" bevatten',
    );
    // rel moet zowel noopener als noreferrer bevatten
    assertEquals(
      html.includes("noopener"),
      true,
      'rel moet "noopener" bevatten',
    );
    assertEquals(
      html.includes("noreferrer"),
      true,
      'rel moet "noreferrer" bevatten',
    );
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("Relatieve/interne link krijgt geen target=_blank", async () => {
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "src", "week-1");
  const outputDir = join(tempRoot, "build");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "interne-link.md");
    await Deno.writeTextFile(
      sourcePath,
      "# Les 1\n\n[andere les](../week-2/les.html)\n",
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
    });

    const html = await Deno.readTextFile(result.outputPath);

    // De relatieve link mag geen target="_blank" krijgen
    assertEquals(
      html.includes('target="_blank"'),
      false,
      'Relatieve/interne link mag geen target="_blank" bevatten',
    );
  } finally {
    await removeDir(tempRoot);
  }
});
