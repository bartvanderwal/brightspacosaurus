/**
 * Property tests voor ReaderPdfConverter.
 *
 * Feature: readers-en-pdf-export
 * - Property 1: PDF-conversie produceert uitvoer op juiste pad
 * - Property 3: Foutrapportage bij ongeldige invoer
 *
 * **Validates: Requirements 6.1, 6.5, 6.6, 7.2**
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { join } from "@std/path";
import {
  convertReaderToPdf,
  pandocAvailable,
} from "../src/reader-pdf-converter.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_pbt_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

/**
 * Controleert of een bestand bestaat op het opgegeven pad.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Property 1: PDF-conversie produceert uitvoer op het juiste pad met correcte naamgeving
// Feature: readers-en-pdf-export, Property 1: PDF-conversie produceert uitvoer op juiste pad
// Validates: Requirements 6.1, 6.5, 7.2
// ---------------------------------------------------------------------------

Deno.test({
  name: "Property 1: PDF-conversie produceert uitvoer op juiste pad met correcte naamgeving",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  fn: async () => {
    // Feature: readers-en-pdf-export, Property 1: PDF-conversie produceert uitvoer op juiste pad
    // **Validates: Requirements 6.1, 6.5, 7.2**
    //
    // Strategie: genereer willekeurige geldige reader-bestandsnamen (prefix reader- +
    // willekeurige slug), maak tijdelijke Markdown-bestanden, voer conversie uit,
    // controleer bestandsexistentie en naamgeving (.md → .pdf).
    await fc.assert(
      fc.asyncProperty(
        // Genereer willekeurige geldige reader-bestandsnamen: reader- + slug + .md
        fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/).map(
          (slug) => `reader-${slug}.md`,
        ),
        async (readerFilename) => {
          const tempRoot = await makeTempDir();
          const sourceDir = join(tempRoot, "source");
          const outputDir = join(tempRoot, "output", "readers");

          try {
            // Maak bronmap en tijdelijk Markdown-bestand
            await Deno.mkdir(sourceDir, { recursive: true });
            const sourcePath = join(sourceDir, readerFilename);
            await Deno.writeTextFile(
              sourcePath,
              `# Test Reader\n\nDit is een test-reader voor ${readerFilename}.\n`,
            );

            // Voer conversie uit
            const result = await convertReaderToPdf({
              sourcePath,
              outputDir,
              repoRoot: tempRoot,
            });

            // Controleer: bestandsnaam is .md → .pdf
            const expectedPdfFilename = readerFilename.replace(
              /\.md$/,
              ".pdf",
            );
            assertEquals(
              result.filename,
              expectedPdfFilename,
              `Bestandsnaam moet ${expectedPdfFilename} zijn, maar was ${result.filename}`,
            );

            // Controleer: outputPath is in de juiste map
            assertEquals(
              result.outputPath,
              join(outputDir, expectedPdfFilename),
              "outputPath moet in de opgegeven uitvoermap staan",
            );

            // Controleer: PDF-bestand bestaat daadwerkelijk
            const fileInfo = await Deno.stat(result.outputPath);
            assertEquals(
              fileInfo.isFile,
              true,
              "Het gegenereerde PDF-bestand moet bestaan",
            );

            // Controleer: PDF-bestand is niet leeg
            assertEquals(
              fileInfo.size > 0,
              true,
              "Het gegenereerde PDF-bestand mag niet leeg zijn",
            );
          } finally {
            await removeDir(tempRoot);
          }
        },
      ),
      { numRuns: 10 },
    );
  },
});

// ---------------------------------------------------------------------------
// Property 3: Foutrapportage bij ongeldige invoer
// Feature: readers-en-pdf-export, Property 3: Foutrapportage bij ongeldige invoer
// Validates: Requirements 6.6
// ---------------------------------------------------------------------------

Deno.test({
  name: "Property 3: Foutrapportage — niet-bestaand bronbestand gooit fout met bronpad",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  fn: async () => {
    // Feature: readers-en-pdf-export, Property 3: Foutrapportage bij ongeldige invoer
    // **Validates: Requirements 6.6**
    //
    // Strategie: genereer willekeurige niet-bestaande bronpaden en controleer dat
    // convertReaderToPdf een fout gooit die het bronpad bevat, en dat er geen
    // gedeeltelijk PDF-bestand achterblijft.
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^reader-[a-z][a-z0-9-]{1,20}$/),
        async (readerSlug) => {
          const tempRoot = await makeTempDir();
          const outputDir = join(tempRoot, "output");
          // Bronbestand bestaat bewust NIET
          const nonExistentSource = join(
            tempRoot,
            "bronnen",
            `${readerSlug}.md`,
          );
          const expectedPdfPath = join(outputDir, `${readerSlug}.pdf`);

          try {
            // Verwacht dat conversie faalt
            let thrownError: Error | null = null;
            try {
              await convertReaderToPdf({
                sourcePath: nonExistentSource,
                outputDir,
                repoRoot: tempRoot,
              });
            } catch (e) {
              thrownError = e as Error;
            }

            // Controleer dat er een fout is gegooid
            assertEquals(
              thrownError !== null,
              true,
              `Conversie van niet-bestaand bestand ${nonExistentSource} moet een fout gooien`,
            );

            // Controleer dat de foutmelding het bronbestandspad bevat
            assertEquals(
              thrownError!.message.includes(nonExistentSource),
              true,
              `Foutmelding moet het bronpad bevatten. Foutmelding was: ${thrownError!.message}`,
            );

            // Controleer dat er geen PDF-bestand is achtergelaten
            const pdfLeftBehind = await fileExists(expectedPdfPath);
            assertEquals(
              pdfLeftBehind,
              false,
              `Er mag geen gedeeltelijk PDF-bestand achterblijven op ${expectedPdfPath}`,
            );
          } finally {
            await removeDir(tempRoot);
          }
        },
      ),
      { numRuns: 30 },
    );
  },
});

Deno.test({
  name: "Property 3: Foutrapportage — ongeldig Markdown met ongeldige LaTeX laat geen PDF achter",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  fn: async () => {
    // Feature: readers-en-pdf-export, Property 3: Foutrapportage bij ongeldige invoer
    // **Validates: Requirements 6.6**
    //
    // Strategie: genereer Markdown-bestanden met ongeldige LaTeX-commando's die
    // pandoc laten falen. Controleer dat de foutmelding het bronpad bevat en dat
    // er geen gedeeltelijk PDF-bestand achterblijft.
    //
    // Pandoc faalt niet standaard op ontbrekende afbeeldingen, daarom gebruiken we
    // ongeldige LaTeX (\begin zonder \end) om een betrouwbare fout te forceren.
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^reader-[a-z][a-z0-9-]{1,15}$/),
        fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/),
        async (readerSlug, imageName) => {
          const tempRoot = await makeTempDir();
          const sourcesDir = join(tempRoot, "bronnen");
          const outputDir = join(tempRoot, "output");
          await Deno.mkdir(sourcesDir, { recursive: true });

          const sourcePath = join(sourcesDir, `${readerSlug}.md`);
          const expectedPdfPath = join(outputDir, `${readerSlug}.pdf`);

          // Maak een Markdown-bestand met ongeldige LaTeX die pandoc laat falen
          // Een onafgesloten \begin{} zonder \end{} veroorzaakt een LaTeX-fout
          const invalidContent = [
            `# Test reader ${readerSlug}`,
            "",
            `![Ontbrekende afbeelding](niet-bestaand-${imageName}.png)`,
            "",
            "```{=latex}",
            "\\begin{invalidenvironment}",
            "Dit is ongeldig LaTeX zonder bijbehorend \\end commando.",
            "```",
            "",
          ].join("\n");

          await Deno.writeTextFile(sourcePath, invalidContent);

          try {
            // Verwacht dat conversie faalt door ongeldige LaTeX
            let thrownError: Error | null = null;
            try {
              await convertReaderToPdf({
                sourcePath,
                outputDir,
                repoRoot: tempRoot,
              });
            } catch (e) {
              thrownError = e as Error;
            }

            // Controleer dat er een fout is gegooid
            assertEquals(
              thrownError !== null,
              true,
              `Conversie van ongeldig Markdown-bestand ${sourcePath} moet een fout gooien`,
            );

            // Controleer dat de foutmelding het bronbestandspad bevat
            assertEquals(
              thrownError!.message.includes(sourcePath),
              true,
              `Foutmelding moet het bronpad bevatten. Foutmelding was: ${thrownError!.message}`,
            );

            // Controleer dat er geen PDF-bestand is achtergelaten
            const pdfLeftBehind = await fileExists(expectedPdfPath);
            assertEquals(
              pdfLeftBehind,
              false,
              `Er mag geen gedeeltelijk PDF-bestand achterblijven op ${expectedPdfPath}`,
            );
          } finally {
            await removeDir(tempRoot);
          }
        },
      ),
      { numRuns: 20 },
    );
  },
});
