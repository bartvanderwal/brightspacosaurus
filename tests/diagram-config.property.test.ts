/**
 * Property-based test voor config-resolutie van het `diagrams`-object.
 *
 * Feature: diagram-rendering-a11y, Property 6: Config-resolutie en mapping
 *
 * **Validates: Requirements 2.2, 2.3, 2.5**
 *
 * NB: De mapping van de opgeloste config naar remark-kroki-opties
 * (`server`/`output` via `buildKrokiA11yOptions`) wordt in Taak 3 geïmplementeerd
 * (`src/diagram-config.ts` bestaat nog niet). Deze test dekt daarom UITSLUITEND
 * het `resolveConfig`-gedrag (default-invulling en URL-behoud). Taak 3 kan deze
 * test uitbreiden met de `server`/`output`-mapping-assertions.
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { resolveConfig } from "../src/config-loader.ts";
import type { BsoConfig } from "../src/types.ts";

const REPO_ROOT = "/repo";

// ---------------------------------------------------------------------------
// Hulpgeneratoren
// ---------------------------------------------------------------------------

/** Verplichte niet-lege config-string (courseName/version/sourcesDir). */
const requiredStringArb = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,30}$/);

/** Een geldige Kroki-URL. */
const validUrlArb = fc.oneof(
  fc.constant("https://kroki.io"),
  fc.constant("http://localhost:8000"),
  fc.constant("https://kroki.example.com/render"),
  fc.webUrl(),
);

/** Toegestane output-waarden. */
const outputArb = fc.constantFrom(
  "img-html-base64" as const,
  "inline-svg" as const,
  "img-base64" as const,
  "object-base64" as const,
);

/** Genereert een optioneel `diagrams`-object met wisselend aanwezige velden. */
const diagramsArb = fc.option(
  fc.record(
    {
      krokiUrl: fc.option(validUrlArb, { nil: undefined }),
      output: fc.option(outputArb, { nil: undefined }),
      failOnError: fc.option(fc.boolean(), { nil: undefined }),
    },
    { requiredKeys: [] },
  ),
  { nil: undefined },
);

/** Genereert een geldig BsoConfig-object met optionele diagrams-config. */
const bsoConfigArb: fc.Arbitrary<BsoConfig> = fc.record(
  {
    courseName: requiredStringArb,
    version: requiredStringArb,
    sourcesDir: requiredStringArb,
    diagrams: diagramsArb,
  },
  { requiredKeys: ["courseName", "version", "sourcesDir"] },
);

// ---------------------------------------------------------------------------
// Property 6: Config-resolutie
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "Property 6: resolveConfig vult default krokiUrl/output in bij afwezigheid en behoudt een geldige URL exact",
  fn() {
    // Feature: diagram-rendering-a11y, Property 6
    fc.assert(
      fc.property(bsoConfigArb, (config) => {
        const resolved = resolveConfig(config, {}, REPO_ROOT);

        // krokiUrl: default wanneer afwezig, anders exact behouden
        if (config.diagrams?.krokiUrl === undefined) {
          assertEquals(
            resolved.diagrams.krokiUrl,
            "https://kroki.io",
            "Ontbrekende krokiUrl moet default 'https://kroki.io' krijgen",
          );
        } else {
          assertEquals(
            resolved.diagrams.krokiUrl,
            config.diagrams.krokiUrl,
            "Een aanwezige geldige krokiUrl moet exact behouden blijven",
          );
        }

        // output: default wanneer afwezig, anders exact behouden
        if (config.diagrams?.output === undefined) {
          assertEquals(
            resolved.diagrams.output,
            "img-html-base64",
            "Ontbrekende output moet default 'img-html-base64' krijgen",
          );
        } else {
          assertEquals(
            resolved.diagrams.output,
            config.diagrams.output,
            "Een aanwezige output-waarde moet exact behouden blijven",
          );
        }

        // failOnError: default true wanneer afwezig, anders exact behouden
        if (config.diagrams?.failOnError === undefined) {
          assertEquals(resolved.diagrams.failOnError, true);
        } else {
          assertEquals(resolved.diagrams.failOnError, config.diagrams.failOnError);
        }

        // locale is (nog) niet user-facing en is altijd 'nl'
        assertEquals(resolved.diagrams.locale, "nl");
      }),
      { numRuns: 100 },
    );
  },
});
