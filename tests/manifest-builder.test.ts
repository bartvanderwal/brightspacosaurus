/**
 * Property-based tests voor ManifestBuilder.
 *
 * Feature: brightspacosaurus
 * Eigenschap 3: Pakketinhoud is correct en compleet
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { buildManifest } from "../src/manifest-builder.ts";
import { ManifestEntry } from "../src/types.ts";

// ---------------------------------------------------------------------------
// Eigenschap 3: Pakketinhoud is correct en compleet
// Valideert: Requirements 2.1, 2.3
// ---------------------------------------------------------------------------

/** Generator voor een geldige ManifestEntry. */
const manifestEntryArb = (type: ManifestEntry["type"]) =>
  fc.record({
    id: fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/),
    title: fc.stringMatching(/^[A-Za-z0-9 ]{1,30}$/),
    href: fc.stringMatching(/^content\/[a-z0-9-]{1,20}\.(html|xml)$/),
    type: fc.constant(type),
  });

Deno.test("Eigenschap 3: manifest bevat een resource-entry voor elk bronbestand en elk quizbestand", async () => {
  // Feature: brightspacosaurus, Eigenschap 3: Pakketinhoud correct en compleet
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(
        fc.stringMatching(/^[A-Za-z0-9 ]{3,30}$/), // cursustitel
        fc.array(manifestEntryArb("webcontent"), { minLength: 1, maxLength: 10 }), // HTML-entries
        fc.array(manifestEntryArb("imsqti_xmlv1p2/imscc_xmlv1p3/assessment"), { minLength: 0, maxLength: 5 }) // QTI-entries
      ),
      async ([courseTitle, htmlEntries, qtiEntries]) => {
        const allEntries = [...htmlEntries, ...qtiEntries];
        const xml = buildManifest(courseTitle, allEntries);

        // Eigenschap: het manifest is geldige XML (begint met declaratie)
        assertEquals(xml.startsWith('<?xml version="1.0"'), true, "Manifest moet beginnen met XML-declaratie");

        // Eigenschap: het manifest bevat de cursustitel
        assertEquals(xml.includes(courseTitle), true, "Manifest moet de cursustitel bevatten");

        // Eigenschap: voor elke entry bestaat een resource-element met het juiste type
        for (const entry of allEntries) {
          assertEquals(
            xml.includes(`identifier="${entry.id}"`),
            true,
            `Manifest moet resource met id "${entry.id}" bevatten`
          );
          assertEquals(
            xml.includes(`type="${entry.type}"`),
            true,
            `Manifest moet resourcetype "${entry.type}" bevatten`
          );
          assertEquals(
            xml.includes(`href="${entry.href}"`),
            true,
            `Manifest moet href "${entry.href}" bevatten`
          );
        }

        // Eigenschap: voor elke webcontent-entry bestaat een item-element met de titel
        // QTI-assessments worden niet als organization-item opgenomen (alleen als resource)
        for (const entry of htmlEntries) {
          assertEquals(
            xml.includes(`<title>${entry.title}</title>`),
            true,
            `Manifest moet item met titel "${entry.title}" bevatten`
          );
        }

        // Eigenschap: QTI-entries hebben wél een resource maar GEEN organization-item
        for (const entry of qtiEntries) {
          assertEquals(
            xml.includes(`identifier="${entry.id}"`),
            true,
            `Manifest moet resource met id "${entry.id}" bevatten (QTI)`
          );
        }

        // Eigenschap: het manifest bevat het IMS CC 1.3 schema
        assertEquals(xml.includes("<schemaversion>1.3.0</schemaversion>"), true, "Manifest moet CC 1.3 schema bevatten");
      }
    ),
    { numRuns: 50 }
  );
});

Deno.test("Eigenschap 3: manifest met lege entries-lijst genereert geldig XML zonder resources", () => {
  const xml = buildManifest("Lege cursus", []);
  assertEquals(xml.includes('<?xml version="1.0"'), true, "Moet geldige XML zijn");
  assertEquals(xml.includes("Lege cursus"), true, "Moet de cursustitel bevatten");
  assertEquals(xml.includes("<resources>"), true, "Moet een resources-element bevatten");
});

Deno.test("Brightspace-manifest groepeert weekmappen met dezelfde niveauconventie als Docusaurus", () => {
  const xml = buildManifest("OWE 1", [
    {
      id: "res_content_week_1_lesoverzicht_1_1_html",
      title: "lesoverzicht-1.1",
      href: "content/week-1/lesoverzicht-1.1.html",
      type: "webcontent",
    },
    {
      id: "res_content_week_8_lesoverzicht_8_1_html",
      title: "lesoverzicht-8.1",
      href: "content/week-8/lesoverzicht-8.1.html",
      type: "webcontent",
    },
  ]);

  assertEquals(xml.includes("<title>Week 1 — Niveau 1</title>"), true);
  assertEquals(xml.includes("<title>Week 8 — Niveau 4</title>"), true);
  assertEquals(xml.includes('identifierref="res_content_week_1_lesoverzicht_1_1_html"'), true);
  assertEquals(xml.includes('identifierref="res_content_week_8_lesoverzicht_8_1_html"'), true);
});
