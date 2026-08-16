/**
 * Property-based test voor linkconversie van reader-verwijzingen.
 *
 * Feature: readers-en-pdf-export, Property 5: Linkconversie van reader-verwijzingen
 *
 * **Validates: Requirements 8.5**
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { convertReaderLinks } from "../src/markdown-converter.ts";

// ---------------------------------------------------------------------------
// Hulpgeneratoren
// ---------------------------------------------------------------------------

/** Genereert een geldige reader-slug (lowercase alfanumeriek met koppeltekens). */
const readerSlugArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,20}$/);

/** Genereert een reader-bestandsnaam: prefix `reader-` + slug + `.md`, of `plantuml-essentials.md`. */
const readerFilenameArb = fc.oneof(
  readerSlugArb.map((slug) => `reader-${slug}.md`),
  fc.constant("plantuml-essentials.md")
);

/** Genereert een padprefix met variërende diepte (0 tot 4 niveaus `../`). */
const pathPrefixArb = fc.nat({ max: 4 }).map((depth) => "../".repeat(depth));

/** Genereert willekeurige linktekst (geen vierkante haken of newlines). */
const linkTextArb = fc.stringMatching(/^[A-Za-z0-9 _-]{1,30}$/);

/** Genereert een niet-reader link (geen reader-prefix, geen plantuml-essentials). */
const nonReaderLinkArb = fc.record({
  text: linkTextArb,
  href: fc.oneof(
    fc.constant("https://example.com/page"),
    fc.constant("../week-1/lesoverzicht-1.1.md"),
    fc.constant("./img/diagram.png"),
    fc.constant("andere-pagina.md"),
    fc.constant("#sectie-anker"),
    fc.stringMatching(/^[a-z][a-z0-9-]{1,15}\.html$/)
  ),
});

// ---------------------------------------------------------------------------
// Property 5: Linkconversie van reader-verwijzingen
// ---------------------------------------------------------------------------

Deno.test({
  name: "Property 5: Reader-links worden correct geconverteerd naar PDF-links in ../readers/",
  fn() {
    // Feature: readers-en-pdf-export, Property 5: Linkconversie van reader-verwijzingen
    fc.assert(
      fc.property(
        fc.record({
          text: linkTextArb,
          prefix: pathPrefixArb,
          filename: readerFilenameArb,
        }),
        ({ text, prefix, filename }) => {
          const markdown = `[${text}](${prefix}${filename})`;
          const result = convertReaderLinks(markdown);

          // Verwachte PDF-bestandsnaam: .md → .pdf
          const expectedPdfFilename = filename.replace(/\.md$/, ".pdf");
          // Verwacht pad: altijd ../readers/<bestandsnaam>.pdf
          const expectedLink = `[${text}](../readers/${expectedPdfFilename})`;

          assertEquals(
            result,
            expectedLink,
            `Link "${markdown}" moet worden geconverteerd naar "${expectedLink}", maar werd "${result}"`
          );
        }
      ),
      { numRuns: 100 }
    );
  },
});

Deno.test({
  name: "Property 5: Niet-reader-links blijven ongewijzigd na convertReaderLinks",
  fn() {
    // Feature: readers-en-pdf-export, Property 5: Linkconversie van reader-verwijzingen
    fc.assert(
      fc.property(nonReaderLinkArb, ({ text, href }) => {
        const markdown = `[${text}](${href})`;
        const result = convertReaderLinks(markdown);

        assertEquals(
          result,
          markdown,
          `Niet-reader-link "${markdown}" mag niet worden gewijzigd, maar werd "${result}"`
        );
      }),
      { numRuns: 100 }
    );
  },
});

Deno.test({
  name: "Property 5: Meerdere reader-links in één tekst worden allemaal geconverteerd",
  fn() {
    // Feature: readers-en-pdf-export, Property 5: Linkconversie van reader-verwijzingen
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: linkTextArb,
            prefix: pathPrefixArb,
            filename: readerFilenameArb,
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (links) => {
          // Bouw Markdown met meerdere reader-links, gescheiden door tekst
          const markdown = links
            .map(({ text, prefix, filename }) => `Zie [${text}](${prefix}${filename}) voor meer info.`)
            .join("\n\n");

          const result = convertReaderLinks(markdown);

          // Controleer dat elke link correct is geconverteerd
          for (const { text, filename } of links) {
            const expectedPdfFilename = filename.replace(/\.md$/, ".pdf");
            const expectedLink = `[${text}](../readers/${expectedPdfFilename})`;
            assertEquals(
              result.includes(expectedLink),
              true,
              `Resultaat moet "${expectedLink}" bevatten. Volledig resultaat: "${result}"`
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  },
});

Deno.test({
  name: "Property 5: Mix van reader- en niet-reader-links behoudt niet-reader-links",
  fn() {
    // Feature: readers-en-pdf-export, Property 5: Linkconversie van reader-verwijzingen
    fc.assert(
      fc.property(
        fc.record({
          readerText: linkTextArb,
          readerPrefix: pathPrefixArb,
          readerFilename: readerFilenameArb,
          nonReader: nonReaderLinkArb,
        }),
        ({ readerText, readerPrefix, readerFilename, nonReader }) => {
          const markdown = `Bekijk [${readerText}](${readerPrefix}${readerFilename}) en ook [${nonReader.text}](${nonReader.href}).`;
          const result = convertReaderLinks(markdown);

          // Reader-link moet geconverteerd zijn
          const expectedPdfFilename = readerFilename.replace(/\.md$/, ".pdf");
          const expectedReaderLink = `[${readerText}](../readers/${expectedPdfFilename})`;
          assertEquals(
            result.includes(expectedReaderLink),
            true,
            `Reader-link moet geconverteerd zijn naar "${expectedReaderLink}". Resultaat: "${result}"`
          );

          // Niet-reader-link moet ongewijzigd zijn
          const expectedNonReaderLink = `[${nonReader.text}](${nonReader.href})`;
          assertEquals(
            result.includes(expectedNonReaderLink),
            true,
            `Niet-reader-link "${expectedNonReaderLink}" moet ongewijzigd blijven. Resultaat: "${result}"`
          );
        }
      ),
      { numRuns: 100 }
    );
  },
});
