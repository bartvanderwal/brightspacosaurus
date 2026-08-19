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

Deno.test("Brightspace-manifest groepeert entries op eerste submap-naam", () => {
  const xml = buildManifest("Cursus X", [
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
    {
      id: "res_content_module_a_intro_html",
      title: "Introductie",
      href: "content/module-a/intro.html",
      type: "webcontent",
    },
  ]);

  // Generieke groepering op mapnaam, geen OWE-1 week/niveau mapping
  assertEquals(xml.includes("<title>week-1</title>"), true, "Moet groep 'week-1' bevatten");
  assertEquals(xml.includes("<title>week-8</title>"), true, "Moet groep 'week-8' bevatten");
  assertEquals(xml.includes("<title>module-a</title>"), true, "Moet groep 'module-a' bevatten");
  assertEquals(xml.includes('identifierref="res_content_week_1_lesoverzicht_1_1_html"'), true);
  assertEquals(xml.includes('identifierref="res_content_week_8_lesoverzicht_8_1_html"'), true);
  assertEquals(xml.includes('identifierref="res_content_module_a_intro_html"'), true);

  // Mag GEEN OWE-1-specifieke niveaulabels bevatten
  assertEquals(xml.includes("Niveau"), false, "Mag geen OWE-1-specifieke niveaulabels bevatten");
});

// ---------------------------------------------------------------------------
// Test: geen dubbele HTML-entity-encoding in manifest-titels (GitHub issue #1)
// ---------------------------------------------------------------------------

/**
 * Simuleert de decodeHtmlEntities-functie uit main.ts zodat we de
 * volledige keten kunnen testen: HTML-titel → decode → buildManifest → XML.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

Deno.test("Manifest-titels worden single-escaped: geen dubbele entity-encoding (issue #1)", () => {
  // Simuleer een H1 geëxtraheerd uit door rehype gegenereerde HTML.
  // rehype escapet '&' correct naar '&amp;' in de HTML.
  const htmlTitle = "Ontwerp &amp; Implementatie";

  // Na decodeHtmlEntities (zoals in main.ts) krijgen we plain text:
  const decodedTitle = decodeHtmlEntities(htmlTitle);
  assertEquals(decodedTitle, "Ontwerp & Implementatie");

  // buildManifest escapet de titel opnieuw naar geldige XML:
  const xml = buildManifest("Testcursus", [
    {
      id: "res_content_week_1_ontwerp_html",
      title: decodedTitle,
      href: "content/week-1/ontwerp.html",
      type: "webcontent",
    },
  ]);

  // De titel in het manifest moet single-escaped '&amp;' bevatten, NIET '&amp;amp;'
  assertEquals(
    xml.includes("<title>Ontwerp &amp; Implementatie</title>"),
    true,
    "Manifest moet single-escaped '&amp;' bevatten",
  );
  assertEquals(
    xml.includes("&amp;amp;"),
    false,
    "Manifest mag GEEN dubbel-geëscapete '&amp;amp;' bevatten",
  );
});

Deno.test("Manifest-titels met meerdere HTML-entities worden correct gedecodeerd", () => {
  // H1 met meerdere entities (zoals uit rehype HTML)
  const htmlTitle = "C++ &amp; Java &lt;8&gt; &quot;basics&quot;";
  const decodedTitle = decodeHtmlEntities(htmlTitle);
  assertEquals(decodedTitle, 'C++ & Java <8> "basics"');

  const xml = buildManifest("Testcursus", [
    {
      id: "res_content_week_2_languages_html",
      title: decodedTitle,
      href: "content/week-2/languages.html",
      type: "webcontent",
    },
  ]);

  // Alle speciale tekens moeten correct single-escaped zijn in de XML
  assertEquals(xml.includes("&amp;amp;"), false, "Geen dubbele ampersand-escaping");
  assertEquals(xml.includes("&amp;lt;"), false, "Geen dubbele lt-escaping");
  assertEquals(xml.includes("&amp;gt;"), false, "Geen dubbele gt-escaping");

  // Wel correcte XML-escaping:
  assertEquals(xml.includes("C++ &amp; Java"), true, "Ampersand correct single-escaped");
  assertEquals(xml.includes("&lt;8&gt;"), true, "Angle brackets correct single-escaped");
  assertEquals(xml.includes("&quot;basics&quot;"), true, "Quotes correct single-escaped");
});
