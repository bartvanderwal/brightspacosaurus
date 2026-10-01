/**
 * Property-based tests voor ManifestBuilder.
 *
 * Feature: brightspacosaurus
 * Eigenschap 3: Pakketinhoud is correct en compleet
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import fc from "fast-check";
import {
  buildManifest,
  deriveReaderMenuTitle,
  sortManifestEntriesForNavigation,
} from "../src/manifest-builder.ts";
import type { ManifestEntry } from "../src/types.ts";

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
    fc.property(
      fc.tuple(
        fc.stringMatching(/^[A-Za-z0-9 ]{3,30}$/), // cursustitel
        fc.array(manifestEntryArb("webcontent"), {
          minLength: 1,
          maxLength: 10,
        }), // HTML-entries
        fc.array(manifestEntryArb("imsqti_xmlv1p2/imscc_xmlv1p3/assessment"), {
          minLength: 0,
          maxLength: 5,
        }), // QTI-entries
      ),
      ([courseTitle, htmlEntries, qtiEntries]) => {
        const allEntries = [...htmlEntries, ...qtiEntries];
        const xml = buildManifest(courseTitle, allEntries);

        // Eigenschap: het manifest is geldige XML (begint met declaratie)
        assertEquals(
          xml.startsWith('<?xml version="1.0"'),
          true,
          "Manifest moet beginnen met XML-declaratie",
        );

        // Eigenschap: het manifest bevat de cursustitel
        assertEquals(
          xml.includes(courseTitle),
          true,
          "Manifest moet de cursustitel bevatten",
        );

        // Eigenschap: voor elke entry bestaat een resource-element met het juiste type
        for (const entry of allEntries) {
          assertEquals(
            xml.includes(`identifier="${entry.id}"`),
            true,
            `Manifest moet resource met id "${entry.id}" bevatten`,
          );
          assertEquals(
            xml.includes(`type="${entry.type}"`),
            true,
            `Manifest moet resourcetype "${entry.type}" bevatten`,
          );
          assertEquals(
            xml.includes(`href="${entry.href}"`),
            true,
            `Manifest moet href "${entry.href}" bevatten`,
          );
        }

        // Eigenschap: voor elke entry bestaat een item-element met de titel.
        // QTI-assessments worden ook als organization-item opgenomen zodat
        // Brightspace de ingebouwde test-koppelpagina in de week toont.
        for (const entry of htmlEntries) {
          assertEquals(
            xml.includes(`<title>${entry.title}</title>`),
            true,
            `Manifest moet item met titel "${entry.title}" bevatten`,
          );
        }

        // Eigenschap: QTI-entries hebben zowel een resource als organization-item
        for (const entry of qtiEntries) {
          assertEquals(
            xml.includes(`identifier="${entry.id}"`),
            true,
            `Manifest moet resource met id "${entry.id}" bevatten (QTI)`,
          );
          assertEquals(
            xml.includes(`identifierref="${entry.id}"`),
            true,
            `Manifest moet QTI-entry "${entry.id}" in de organization opnemen`,
          );
          assertEquals(
            xml.includes(`<title>${entry.title}</title>`),
            true,
            `Manifest moet QTI-item met titel "${entry.title}" bevatten`,
          );
        }

        // Eigenschap: het manifest bevat het IMS CC 1.3 schema
        assertEquals(
          xml.includes("<schemaversion>1.3.0</schemaversion>"),
          true,
          "Manifest moet CC 1.3 schema bevatten",
        );
      },
    ),
    { numRuns: 50 },
  );
});

Deno.test("Eigenschap 3: manifest met lege entries-lijst genereert geldig XML zonder resources", () => {
  const xml = buildManifest("Lege cursus", []);
  assertEquals(
    xml.includes('<?xml version="1.0"'),
    true,
    "Moet geldige XML zijn",
  );
  assertEquals(
    xml.includes("Lege cursus"),
    true,
    "Moet de cursustitel bevatten",
  );
  assertEquals(
    xml.includes("<resources>"),
    true,
    "Moet een resources-element bevatten",
  );
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
  assertEquals(
    xml.includes("<title>week-1</title>"),
    true,
    "Moet groep 'week-1' bevatten",
  );
  assertEquals(
    xml.includes("<title>week-8</title>"),
    true,
    "Moet groep 'week-8' bevatten",
  );
  assertEquals(
    xml.includes("<title>module-a</title>"),
    true,
    "Moet groep 'module-a' bevatten",
  );
  assertEquals(
    xml.includes('identifierref="res_content_week_1_lesoverzicht_1_1_html"'),
    true,
  );
  assertEquals(
    xml.includes('identifierref="res_content_week_8_lesoverzicht_8_1_html"'),
    true,
  );
  assertEquals(
    xml.includes('identifierref="res_content_module_a_intro_html"'),
    true,
  );

  // Mag GEEN OWE-1-specifieke niveaulabels bevatten
  assertEquals(
    xml.includes("Niveau"),
    false,
    "Mag geen OWE-1-specifieke niveaulabels bevatten",
  );
});

Deno.test("Brightspace-manifest sorteert quizzen direct na hun lescode binnen een week", () => {
  const entries: ManifestEntry[] = [
    {
      id: "res_quiz_week_6_qti_les_6_2_xml",
      title: "Quiz 6.2",
      href: "quiz/week-6/qti-les-6-2.xml",
      type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
    },
    {
      id: "res_content_week_6_les_6_2_html",
      title: "Les 6.2",
      href: "content/week-6/les-6.2.html",
      type: "webcontent",
    },
    {
      id: "res_quiz_week_6_qti_les_6_1_xml",
      title: "Quiz 6.1",
      href: "quiz/week-6/qti-les-6-1.xml",
      type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
    },
    {
      id: "res_content_week_6_les_6_1_html",
      title: "Les 6.1",
      href: "content/week-6/les-6.1.html",
      type: "webcontent",
    },
  ];

  const sorted = sortManifestEntriesForNavigation(entries);
  assertEquals(sorted.map((entry) => entry.title), [
    "Les 6.1",
    "Quiz 6.1",
    "Les 6.2",
    "Quiz 6.2",
  ]);

  const xml = buildManifest("Cursus X", sorted);
  const les61 = xml.indexOf("<title>Les 6.1</title>");
  const quiz61 = xml.indexOf("<title>Quiz 6.1</title>");
  const les62 = xml.indexOf("<title>Les 6.2</title>");
  const quiz62 = xml.indexOf("<title>Quiz 6.2</title>");

  assertEquals(les61 < quiz61, true);
  assertEquals(quiz61 < les62, true);
  assertEquals(les62 < quiz62, true);
});

Deno.test("Brightspace-manifest zet weekintro of weekindex eerst binnen een week", () => {
  const entries: ManifestEntry[] = [
    {
      id: "res_content_week_7_achtergrond_test_tooling_html",
      title: "Achtergrond test tooling",
      href: "content/week-7/achtergrond-test-tooling.html",
      type: "webcontent",
    },
    {
      id: "res_quiz_week_7_qti_les_7_1_xml",
      title: "Quiz 7.1",
      href: "quiz/week-7/qti-les-7-1.xml",
      type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
    },
    {
      id: "res_content_week_7_les_7_1_html",
      title: "Les 7.1",
      href: "content/week-7/les-7.1.html",
      type: "webcontent",
    },
    {
      id: "res_content_week_7_weekintro_7_html",
      title: "Weekintro 7",
      href: "content/week-7/weekintro-7.html",
      type: "webcontent",
    },
  ];

  const sorted = sortManifestEntriesForNavigation(entries);
  assertEquals(sorted.map((entry) => entry.title), [
    "Weekintro 7",
    "Achtergrond test tooling",
    "Les 7.1",
    "Quiz 7.1",
  ]);

  const xml = buildManifest("Cursus X", sorted);
  const weekintro = xml.indexOf("<title>Weekintro 7</title>");
  const background = xml.indexOf("<title>Achtergrond test tooling</title>");
  const lesson = xml.indexOf("<title>Les 7.1</title>");
  const quiz = xml.indexOf("<title>Quiz 7.1</title>");

  assertEquals(weekintro < background, true);
  assertEquals(background < lesson, true);
  assertEquals(lesson < quiz, true);
});

Deno.test("Module-titel komt uit de H1 van index.html; zonder index blijft de mapnaam", () => {
  const xml = buildManifest("Cursus X", [
    {
      id: "res_week_1_index",
      title: "Week 1: Authoring and links",
      href: "content/week-1/index.html",
      type: "webcontent",
    },
    {
      id: "res_week_1_les",
      title: "Lesson 1.1",
      href: "content/week-1/lesson-1.html",
      type: "webcontent",
    },
    {
      id: "res_week_2_les",
      title: "Lesson 2.1",
      href: "content/week-2/lesson-1.html",
      type: "webcontent",
    },
  ]);
  assertStringIncludes(
    xml,
    '<item identifier="group_week_1">\n        <title>Week 1: Authoring and links</title>',
  );
  assertStringIncludes(
    xml,
    '<item identifier="group_week_2">\n        <title>week-2</title>',
  );
});

Deno.test("Reader-menu titels worden gehumanized in plaats van slugtitels", () => {
  assertEquals(
    deriveReaderMenuTitle("plantuml-essentials.pdf"),
    "Reader PlantUML essentials",
  );
  assertEquals(
    deriveReaderMenuTitle("reader-technisch-schrijven.pdf"),
    "Reader Technisch schrijven",
  );
  assertEquals(
    deriveReaderMenuTitle("reader-git-en-gitlab.pdf"),
    "Reader Git en GitLab",
  );
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
    // Numerieke entities eerst: hex (&#x26;) en decimaal (&#38;)
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_m, hex) => String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Named entities daarna. &amp; als laatste zodat we geen dubbele decode krijgen
    // (bijv. &amp;lt; → &lt; en niet → <).
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
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

Deno.test("Manifest-titels met numerieke hex-entity (&#x26;) worden single-escaped (issue #1)", () => {
  // rehype produceert in de praktijk een hex-entity voor '&' i.p.v. de named entity.
  const htmlTitle = "Ontwerp &#x26; Implementatie";

  // Na decodeHtmlEntities krijgen we plain text:
  const decodedTitle = decodeHtmlEntities(htmlTitle);
  assertEquals(decodedTitle, "Ontwerp & Implementatie");

  const xml = buildManifest("Testcursus", [
    {
      id: "res_content_week_1_ontwerp_html",
      title: decodedTitle,
      href: "content/week-1/ontwerp.html",
      type: "webcontent",
    },
  ]);

  // De titel moet single-escaped '&amp;' bevatten, NIET '&#x26;' of '&amp;amp;'
  assertEquals(
    xml.includes("<title>Ontwerp &amp; Implementatie</title>"),
    true,
    "Manifest moet single-escaped '&amp;' bevatten",
  );
  assertEquals(
    xml.includes("&#x26;"),
    false,
    "Manifest mag GEEN onverwerkte hex-entity '&#x26;' bevatten",
  );
  assertEquals(
    xml.includes("&amp;amp;"),
    false,
    "Manifest mag GEEN dubbel-geëscapete '&amp;amp;' bevatten",
  );
});

Deno.test("Manifest-titels met numerieke decimaal-entity (&#38;) worden single-escaped", () => {
  const decodedTitle = decodeHtmlEntities("Ontwerp &#38; Implementatie");
  assertEquals(decodedTitle, "Ontwerp & Implementatie");
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
  assertEquals(
    xml.includes("&amp;amp;"),
    false,
    "Geen dubbele ampersand-escaping",
  );
  assertEquals(xml.includes("&amp;lt;"), false, "Geen dubbele lt-escaping");
  assertEquals(xml.includes("&amp;gt;"), false, "Geen dubbele gt-escaping");

  // Wel correcte XML-escaping:
  assertEquals(
    xml.includes("C++ &amp; Java"),
    true,
    "Ampersand correct single-escaped",
  );
  assertEquals(
    xml.includes("&lt;8&gt;"),
    true,
    "Angle brackets correct single-escaped",
  );
  assertEquals(
    xml.includes("&quot;basics&quot;"),
    true,
    "Quotes correct single-escaped",
  );
});

Deno.test("Brightspace-manifest plaatst content/docenten in module_docentenmateriaal met dependencies", () => {
  const entries: ManifestEntry[] = [
    {
      id: "res_content_docenten_voortgangsverkenner_html",
      title: "Voortgangsverkenner",
      href: "content/docenten/voortgangsverkenner.html",
      type: "webcontent",
      dependencies: [
        "content/docenten/style.css",
        "content/docenten/app.js",
      ],
    },
  ];

  const xml = buildManifest("Test Course", entries);

  assertStringIncludes(xml, '<item identifier="module_docentenmateriaal">');
  assertStringIncludes(xml, "<title>Instructor material (hide after import)</title>");
  assertStringIncludes(
    xml,
    '<item identifier="item_res_content_docenten_voortgangsverkenner_html" identifierref="res_content_docenten_voortgangsverkenner_html">',
  );
  assertStringIncludes(xml, "<title>Voortgangsverkenner</title>");
  assertStringIncludes(xml, '<file href="content/docenten/voortgangsverkenner.html"/>');
  assertStringIncludes(xml, '<file href="content/docenten/style.css"/>');
  assertStringIncludes(xml, '<file href="content/docenten/app.js"/>');
});

// ---------------------------------------------------------------------------
// readersModule, sidebar_position and the teacher page (menu order)
// ---------------------------------------------------------------------------

function page(href: string, title: string, position?: number): ManifestEntry {
  return {
    id: "res_" + href.replace(/[^a-z0-9]/gi, "_"),
    title,
    href,
    type: "webcontent",
    ...(position === undefined ? {} : { position }),
  };
}

const menuEntries = [
  page("content/algemeen/faq.html", "FAQ", 2),
  page("content/algemeen/README.html", "Studentenhandleiding", 1),
  page("content/algemeen/voor-docenten.html", "Voor docenten", 4),
  page("content/algemeen/index.html", "Algemeen", 0),
  page("content/week-1/les-1.html", "Les 1"),
  page("readers/reader-git.pdf", "Reader Git"),
  page("readers/reader-plantuml.pdf", "Reader PlantUML"),
];

function moduleTitles(xml: string): string[] {
  return [...xml.matchAll(/<item identifier="(group_[^"]+|module_[^"]+)">\s*<title>([^<]+)<\/title>/g)]
    .map((m) => `${m[1]}:${m[2]}`);
}

function itemOrder(xml: string, moduleId: string): string[] {
  const start = xml.indexOf(`<item identifier="${moduleId}">`);
  const block = xml.slice(start, xml.indexOf("\n      </item>", start));
  return [...block.matchAll(/<item identifier="item_[^"]+" identifierref="[^"]+">\s*<title>([^<]+)<\/title>/g)]
    .map((m) => m[1]);
}

Deno.test("by default reader PDFs get their own Readers module", () => {
  const xml = buildManifest("Cursus", sortManifestEntriesForNavigation(menuEntries));
  assertEquals(moduleTitles(xml), ["group_algemeen:Algemeen", "group_week_1:week-1", "module_readers:Readers"]);
});

Deno.test("readersModule with a content folder slug puts the readers in that module, after its pages", () => {
  const sorted = sortManifestEntriesForNavigation(menuEntries, {
    firstHref: "content/algemeen/voor-docenten.html",
  });
  const xml = buildManifest("Cursus", sorted, { slug: "algemeen", title: "Algemeen" });
  assertEquals(moduleTitles(xml), ["group_algemeen:Algemeen", "group_week_1:week-1"]);
  assertEquals(itemOrder(xml, "group_algemeen"), [
    "Voor docenten",
    "Algemeen",
    "Studentenhandleiding",
    "FAQ",
    "Reader Git",
    "Reader PlantUML",
  ]);
});

Deno.test("readersModule without a matching folder keeps a separate module with its title", () => {
  const xml = buildManifest("Cursus", sortManifestEntriesForNavigation(menuEntries), {
    slug: "naslag",
    title: "Naslag",
  });
  assertEquals(moduleTitles(xml).at(-1), "module_naslag:Naslag");
});

Deno.test("sidebar_position orders pages like Docusaurus: positioned pages first, ascending", () => {
  const sorted = sortManifestEntriesForNavigation([
    page("content/w/b.html", "B"),
    page("content/w/c.html", "C", 2),
    page("content/w/a.html", "A"),
    page("content/w/d.html", "D", 1),
  ]);
  assertEquals(sorted.map((e) => e.title), ["D", "C", "A", "B"]);
});
