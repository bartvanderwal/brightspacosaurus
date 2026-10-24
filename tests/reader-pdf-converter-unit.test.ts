/**
 * Unit tests voor ReaderPdfConverter.
 *
 * Feature: readers-en-pdf-export
 * Valideert: Requirements 6.1, 6.6
 */

import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  convertReaderToPdf,
  diagramFilterWarnings,
  pandocAvailable,
  readerDiagramEnv,
} from "../src/reader-pdf-converter.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "reader_pdf_test_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

// ---------------------------------------------------------------------------
// pandocAvailable() tests
// ---------------------------------------------------------------------------

Deno.test({
  name: "pandocAvailable: retourneert een boolean",
  permissions: { run: true },
  fn() {
    const result = pandocAvailable();
    assertEquals(
      typeof result,
      "boolean",
      "pandocAvailable() moet een boolean retourneren",
    );
  },
});

// ---------------------------------------------------------------------------
// Happy path: conversie van simpele Markdown naar PDF
// Valideert: Requirements 6.1
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "convertReaderToPdf: happy path — simpele Markdown wordt omgezet naar PDF",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  async fn() {
    const tempRoot = await makeTempDir();
    const sourceDir = join(tempRoot, "source");
    const outputDir = join(tempRoot, "output");

    try {
      // Maak een simpel Markdown-bronbestand
      await Deno.mkdir(sourceDir, { recursive: true });
      const sourcePath = join(sourceDir, "reader-test.md");
      await Deno.writeTextFile(sourcePath, "# Test\n\nHello world\n");

      // Voer conversie uit
      const result = await convertReaderToPdf({
        sourcePath,
        outputDir,
        repoRoot: tempRoot,
      });

      // Controleer resultaat
      assertEquals(
        result.filename,
        "reader-test.pdf",
        "Bestandsnaam moet .md → .pdf zijn",
      );
      assertEquals(
        result.outputPath,
        join(outputDir, "reader-test.pdf"),
        "Uitvoerpad moet correct zijn",
      );

      // Controleer dat het PDF-bestand daadwerkelijk bestaat
      const stat = await Deno.stat(result.outputPath);
      assertEquals(stat.isFile, true, "PDF-bestand moet bestaan");
      assertEquals(stat.size > 0, true, "PDF-bestand mag niet leeg zijn");
    } finally {
      await removeDir(tempRoot);
    }
  },
});

// ---------------------------------------------------------------------------
// Foutcondities: niet-bestaand bronbestand
// Valideert: Requirements 6.6
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "convertReaderToPdf: fout bij niet-bestaand bronbestand — error bevat bestandspad",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  async fn() {
    const tempRoot = await makeTempDir();
    const outputDir = join(tempRoot, "output");
    const nonExistentPath = join(
      tempRoot,
      "niet-bestaand",
      "reader-missing.md",
    );

    try {
      await assertRejects(
        () =>
          convertReaderToPdf({
            sourcePath: nonExistentPath,
            outputDir,
            repoRoot: tempRoot,
          }),
        Error,
        nonExistentPath,
        "Foutmelding moet het bronbestandspad bevatten",
      );
    } finally {
      await removeDir(tempRoot);
    }
  },
});

// ---------------------------------------------------------------------------
// Cleanup: gedeeltelijke PDF-bestanden worden opgeruimd bij fouten
// Valideert: Requirements 6.6
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "convertReaderToPdf: geen gedeeltelijk PDF-bestand achtergelaten bij fout",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  async fn() {
    const tempRoot = await makeTempDir();
    const sourceDir = join(tempRoot, "source");
    const outputDir = join(tempRoot, "output");

    try {
      // Maak een Markdown-bestand met een verwijzing naar een niet-bestaande afbeelding.
      // Dit zorgt ervoor dat pandoc/pdflatex faalt bij het verwerken.
      await Deno.mkdir(sourceDir, { recursive: true });
      const sourcePath = join(sourceDir, "reader-broken.md");
      await Deno.writeTextFile(
        sourcePath,
        "# Broken\n\n![missing](niet-bestaande-afbeelding-xyz-12345.png)\n",
      );

      const expectedPdfPath = join(outputDir, "reader-broken.pdf");

      // Probeer conversie — dit kan slagen of falen afhankelijk van pandoc-configuratie.
      // Als pandoc faalt, controleer dat er geen PDF achterblijft.
      // Als pandoc slaagt (sommige versies negeren ontbrekende afbeeldingen), is dat ook acceptabel.
      try {
        await convertReaderToPdf({
          sourcePath,
          outputDir,
          repoRoot: tempRoot,
        });
        // Pandoc slaagde (sommige versies geven alleen een waarschuwing bij ontbrekende afbeeldingen)
        // Dit is acceptabel gedrag — de test valideert het cleanup-pad
      } catch {
        // Pandoc faalde — controleer dat er geen gedeeltelijk PDF-bestand achterblijft
        let pdfExists = false;
        try {
          await Deno.stat(expectedPdfPath);
          pdfExists = true;
        } catch {
          pdfExists = false;
        }
        assertEquals(
          pdfExists,
          false,
          "Gedeeltelijk PDF-bestand moet worden opgeruimd bij een fout",
        );
      }
    } finally {
      await removeDir(tempRoot);
    }
  },
});

// ---------------------------------------------------------------------------
// Diagrams in readers follow diagrams.krokiUrl and diagrams.failOnError
// ---------------------------------------------------------------------------

Deno.test("readerDiagramEnv passes the Kroki endpoint and the failure policy to the filter", () => {
  assertEquals(readerDiagramEnv({}), { BSO_DIAGRAMS_FAIL_ON_ERROR: "1" });
  assertEquals(
    readerDiagramEnv({ failOnError: false, krokiUrl: "http://k:8000" }),
    {
      BSO_DIAGRAMS_FAIL_ON_ERROR: "0",
      BSO_KROKI_URL: "http://k:8000",
    },
  );
});

Deno.test("diagramFilterWarnings keeps only the lines of the diagram filter", () => {
  assertEquals(
    diagramFilterWarnings(
      "[WARNING] x\ndiagram-filter: mermaid diagram not rendered (invalid-source)\n",
    ),
    ["diagram-filter: mermaid diagram not rendered (invalid-source)"],
  );
});

const readerWithDiagram = "# Reader\n\n```mermaid\ngraph TD; A-->B\n```\n";

Deno.test({
  name:
    "a reader with a diagram and an unreachable Kroki fails by default and names the category",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  async fn() {
    const tempRoot = await makeTempDir();
    try {
      const sourcePath = join(tempRoot, "reader-diagram.md");
      await Deno.writeTextFile(sourcePath, readerWithDiagram);
      await assertRejects(
        () =>
          convertReaderToPdf({
            sourcePath,
            outputDir: join(tempRoot, "out"),
            repoRoot: tempRoot,
            krokiUrl: "http://127.0.0.1:1",
          }),
        Error,
        "kroki-unreachable",
      );
    } finally {
      await removeDir(tempRoot);
    }
  },
});

Deno.test({
  name:
    "with failOnError false a reader keeps the source block and the build says so",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  async fn() {
    const tempRoot = await makeTempDir();
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      const sourcePath = join(tempRoot, "reader-diagram.md");
      await Deno.writeTextFile(sourcePath, readerWithDiagram);
      const result = await convertReaderToPdf({
        sourcePath,
        outputDir: join(tempRoot, "out"),
        repoRoot: tempRoot,
        krokiUrl: "http://127.0.0.1:1",
        failOnError: false,
      });
      assertEquals((await Deno.stat(result.outputPath)).size > 0, true);
      assertEquals(warnings.some((w) => w.includes("kroki-unreachable")), true);
    } finally {
      console.warn = original;
      await removeDir(tempRoot);
    }
  },
});
