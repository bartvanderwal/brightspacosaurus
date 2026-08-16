/**
 * Property-based test: IMSCC-pakket bevat alle PDF's met manifest-entries.
 *
 * Feature: readers-en-pdf-export, Property 4: IMSCC-pakket bevat alle PDF's met manifest-entries
 *
 * **Validates: Requirements 7.1, 7.3**
 *
 * Test dat de runPack-logica (manifest builder + packer) correct alle PDF-bestanden
 * uit de readers/-map opneemt in het IMSCC-archief met bijbehorende manifest-entries
 * van type `webcontent`.
 */

import { assertEquals, assert } from "@std/assert";
import fc from "fast-check";
import { buildManifest } from "../src/manifest-builder.ts";
import { pack } from "../src/packer.ts";
import { ManifestEntry } from "../src/types.ts";
import { join, basename } from "@std/path";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_pbt4_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

/**
 * Simuleert de PDF-scanning logica uit runPack: scant readers/-map voor PDF-bestanden
 * en genereert ManifestEntry's met type `webcontent`.
 */
function buildPdfManifestEntries(pdfFilenames: string[]): ManifestEntry[] {
  return pdfFilenames.map((filename) => {
    const relPath = "readers/" + filename;
    const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");
    const title = basename(filename, ".pdf");
    return { id, title, href: relPath, type: "webcontent" as const };
  });
}

// ---------------------------------------------------------------------------
// Generatoren
// ---------------------------------------------------------------------------

/** Genereert een geldige reader-slug (lowercase alfanumeriek met koppeltekens). */
const readerSlugArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/);

/** Genereert een PDF-bestandsnaam: prefix `reader-` + slug + `.pdf`, of `plantuml-essentials.pdf`. */
const pdfFilenameArb = fc.oneof(
  { weight: 4, arbitrary: readerSlugArb.map((slug) => `reader-${slug}.pdf`) },
  { weight: 1, arbitrary: fc.constant("plantuml-essentials.pdf") }
);

/** Genereert een unieke set van 1-5 PDF-bestandsnamen. */
const pdfFilenameSetArb = fc.uniqueArray(pdfFilenameArb, { minLength: 1, maxLength: 5 });

// ---------------------------------------------------------------------------
// Property 4: IMSCC-pakket bevat alle PDF's met manifest-entries
// ---------------------------------------------------------------------------

Deno.test({
  name: "Property 4: Manifest bevat een webcontent resource-entry voor elke PDF in readers/",
  fn() {
    // Feature: readers-en-pdf-export, Property 4: IMSCC-pakket bevat alle PDF's met manifest-entries
    fc.assert(
      fc.property(pdfFilenameSetArb, (pdfFilenames) => {
        // Bouw manifest-entries zoals runPack dat doet
        const pdfEntries = buildPdfManifestEntries(pdfFilenames);

        // Voeg een minimale HTML-entry toe (zoals runPack altijd doet)
        const allEntries: ManifestEntry[] = [
          {
            id: "res_content_dummy_html",
            title: "Dummy",
            href: "content/dummy.html",
            type: "webcontent",
          },
          ...pdfEntries,
        ];

        // Genereer manifest
        const manifestXml = buildManifest("OWE 1 - Test", allEntries);

        // Controleer: elke PDF heeft een resource-entry met type webcontent
        for (const filename of pdfFilenames) {
          const expectedHref = `readers/${filename}`;
          const expectedId = "res_" + expectedHref.replace(/[^a-z0-9]/gi, "_");

          assert(
            manifestXml.includes(`identifier="${expectedId}"`),
            `Manifest moet resource met id "${expectedId}" bevatten voor ${filename}`
          );
          assert(
            manifestXml.includes(`href="${expectedHref}"`),
            `Manifest moet href "${expectedHref}" bevatten voor ${filename}`
          );
          // Controleer dat de resource type="webcontent" heeft
          // We zoeken het resource-element dat zowel het id als type bevat
          const resourceRegex = new RegExp(
            `<resource[^>]*identifier="${expectedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*type="webcontent"[^>]*>`
          );
          assert(
            resourceRegex.test(manifestXml),
            `Resource voor ${filename} moet type="webcontent" hebben`
          );
        }
      }),
      { numRuns: 100 }
    );
  },
});

Deno.test({
  name: "Property 4: IMSCC-archief bevat alle PDF-bestanden uit readers/",
  async fn() {
    // Feature: readers-en-pdf-export, Property 4: IMSCC-pakket bevat alle PDF's met manifest-entries
    await fc.assert(
      fc.asyncProperty(pdfFilenameSetArb, async (pdfFilenames) => {
        const tempRoot = await makeTempDir();
        const buildDir = join(tempRoot, "build", "brightspace");
        const readersDir = join(buildDir, "readers");
        const contentDir = join(buildDir, "content");

        try {
          // Maak de build-structuur aan
          await Deno.mkdir(readersDir, { recursive: true });
          await Deno.mkdir(contentDir, { recursive: true });

          // Maak dummy PDF-bestanden aan (minimale inhoud)
          for (const filename of pdfFilenames) {
            await Deno.writeFile(
              join(readersDir, filename),
              new TextEncoder().encode(`%PDF-1.4 dummy content for ${filename}`)
            );
          }

          // Maak een minimaal HTML-bestand aan (content/ mag niet leeg zijn)
          await Deno.writeTextFile(
            join(contentDir, "dummy.html"),
            "<html><body><h1>Dummy</h1></body></html>"
          );

          // Bouw manifest-entries (simuleer runPack-logica)
          const entries: ManifestEntry[] = [
            {
              id: "res_content_dummy_html",
              title: "Dummy",
              href: "content/dummy.html",
              type: "webcontent",
            },
            ...buildPdfManifestEntries(pdfFilenames),
          ];

          // Genereer en schrijf imsmanifest.xml
          const manifestXml = buildManifest("OWE 1 - Test", entries);
          await Deno.writeTextFile(join(buildDir, "imsmanifest.xml"), manifestXml);

          // Pack het archief
          const outputPath = join(tempRoot, "test.imscc");
          await pack({ sourceDir: buildDir, outputPath });

          // Lees het archief en controleer de inhoud
          const zipData = await Deno.readFile(outputPath);
          const zip = await JSZip.loadAsync(zipData);

          // Controleer: elk PDF-bestand zit in het archief
          for (const filename of pdfFilenames) {
            const zipPath = `readers/${filename}`;
            const zipEntry = zip.file(zipPath);
            assert(
              zipEntry !== null,
              `IMSCC-archief moet bestand "${zipPath}" bevatten`
            );

            // Controleer dat de inhoud overeenkomt
            const content = await zipEntry!.async("string");
            assertEquals(
              content,
              `%PDF-1.4 dummy content for ${filename}`,
              `Inhoud van "${zipPath}" in archief moet overeenkomen met bronbestand`
            );
          }

          // Controleer: imsmanifest.xml zit in het archief
          const manifestEntry = zip.file("imsmanifest.xml");
          assert(
            manifestEntry !== null,
            "IMSCC-archief moet imsmanifest.xml bevatten"
          );

          // Controleer: manifest in archief bevat entries voor alle PDF's
          const archivedManifest = await manifestEntry!.async("string");
          for (const filename of pdfFilenames) {
            const expectedHref = `readers/${filename}`;
            assert(
              archivedManifest.includes(`href="${expectedHref}"`),
              `Manifest in archief moet href "${expectedHref}" bevatten`
            );
          }
        } finally {
          await removeDir(tempRoot);
        }
      }),
      { numRuns: 30 }
    );
  },
});

Deno.test({
  name: "Property 4: PDF manifest-entries hebben correcte file-elementen in het manifest",
  fn() {
    // Feature: readers-en-pdf-export, Property 4: IMSCC-pakket bevat alle PDF's met manifest-entries
    fc.assert(
      fc.property(pdfFilenameSetArb, (pdfFilenames) => {
        const pdfEntries = buildPdfManifestEntries(pdfFilenames);
        const allEntries: ManifestEntry[] = [
          {
            id: "res_content_dummy_html",
            title: "Dummy",
            href: "content/dummy.html",
            type: "webcontent",
          },
          ...pdfEntries,
        ];

        const manifestXml = buildManifest("OWE 1 - Test", allEntries);

        // Controleer: elke PDF-resource heeft een <file href="..."/> element
        for (const filename of pdfFilenames) {
          const expectedFileHref = `readers/${filename}`;
          const fileElementRegex = new RegExp(
            `<file href="${expectedFileHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"/>`
          );
          assert(
            fileElementRegex.test(manifestXml),
            `Manifest moet <file href="${expectedFileHref}"/> element bevatten voor ${filename}`
          );
        }
      }),
      { numRuns: 100 }
    );
  },
});

Deno.test({
  name: "Property 4: PDF-entries worden als organization-items opgenomen (webcontent)",
  fn() {
    // Feature: readers-en-pdf-export, Property 4: IMSCC-pakket bevat alle PDF's met manifest-entries
    fc.assert(
      fc.property(pdfFilenameSetArb, (pdfFilenames) => {
        const pdfEntries = buildPdfManifestEntries(pdfFilenames);
        const allEntries: ManifestEntry[] = [
          {
            id: "res_content_dummy_html",
            title: "Dummy",
            href: "content/dummy.html",
            type: "webcontent",
          },
          ...pdfEntries,
        ];

        const manifestXml = buildManifest("OWE 1 - Test", allEntries);

        // Webcontent-entries worden als organization-items opgenomen
        // PDF-entries die niet in een week-map zitten worden als losse items opgenomen
        for (const filename of pdfFilenames) {
          const expectedTitle = basename(filename, ".pdf");
          const expectedId = "res_" + `readers/${filename}`.replace(/[^a-z0-9]/gi, "_");

          // Controleer dat er een item met identifierref naar deze resource bestaat
          assert(
            manifestXml.includes(`identifierref="${expectedId}"`),
            `Manifest moet een organization-item bevatten met identifierref="${expectedId}" voor ${filename}`
          );
          // Controleer dat de titel van het item overeenkomt
          assert(
            manifestXml.includes(`<title>${expectedTitle}</title>`),
            `Manifest moet een item-titel "${expectedTitle}" bevatten voor ${filename}`
          );
        }
      }),
      { numRuns: 100 }
    );
  },
});
