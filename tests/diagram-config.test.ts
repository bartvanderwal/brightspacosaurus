/**
 * Unit tests voor validatie en resolutie van het `diagrams`-config-object.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { assertEquals, assertThrows } from "@std/assert";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { buildKrokiA11yOptions } from "../src/diagram-config.ts";
import type { BsoConfig } from "../src/types.ts";

const REPO_ROOT = "/repo";

/** Minimale, geldige basisconfig. */
function baseConfig(diagrams?: unknown): Record<string, unknown> {
  return {
    courseName: "Test Course",
    version: "1.0.0",
    sourcesDir: "src/",
    ...(diagrams !== undefined ? { diagrams } : {}),
  };
}

// ---------------------------------------------------------------------------
// Geldige diagrams-config
// ---------------------------------------------------------------------------

Deno.test("validateConfig accepteert een geldige diagrams-config", () => {
  const config = baseConfig({
    krokiUrl: "https://kroki.io",
    output: "inline-svg",
    failOnError: false,
  });
  assertEquals(validateConfig(config), true);
});

Deno.test("validateConfig accepteert een afwezige diagrams-config", () => {
  assertEquals(validateConfig(baseConfig()), true);
});

Deno.test("resolveConfig vult defaults in bij een leeg diagrams-object", () => {
  const config = baseConfig({}) as unknown as BsoConfig;
  const resolved = resolveConfig(config, {}, REPO_ROOT);
  assertEquals(resolved.diagrams, {
    krokiUrl: "https://kroki.io",
    output: "img-html-base64",
    failOnError: true,
    locale: "nl",
  });
});

Deno.test("resolveConfig vult defaults in bij een geheel afwezige diagrams-config", () => {
  const config = baseConfig() as unknown as BsoConfig;
  const resolved = resolveConfig(config, {}, REPO_ROOT);
  assertEquals(resolved.diagrams.krokiUrl, "https://kroki.io");
  assertEquals(resolved.diagrams.output, "img-html-base64");
  assertEquals(resolved.diagrams.failOnError, true);
  assertEquals(resolved.diagrams.locale, "nl");
});

Deno.test("resolveConfig vult quiz maxAttempts default in", () => {
  const config = baseConfig() as unknown as BsoConfig;
  const resolved = resolveConfig(config, {}, REPO_ROOT);

  assertEquals(resolved.quiz.maxAttempts, 0);
});

Deno.test("resolveConfig behoudt opgegeven quiz maxAttempts", () => {
  const config = {
    ...baseConfig(),
    quiz: { maxAttempts: 5 },
  } as unknown as BsoConfig;
  const resolved = resolveConfig(config, {}, REPO_ROOT);

  assertEquals(resolved.quiz.maxAttempts, 5);
});

Deno.test("validateConfig accepteert teacherManual als officiële config key", () => {
  const config = {
    ...baseConfig(),
    teacherManual: {
      inputFiles: ["teachers/manual.md"],
      outputName: "teacher-manual.pdf",
    },
  };

  assertEquals(validateConfig(config), true);
});

Deno.test("validateConfig gooit generiek bij onbekende docentenHandleiding config key", () => {
  assertThrows(
    () =>
      validateConfig({
        ...baseConfig(),
        docentenHandleiding: {
          inputFiles: ["teachers/manual.md"],
        },
      }),
    Error,
    "Unknown configuration field 'docentenHandleiding'.",
  );
});

Deno.test("validateConfig gooit bij onbekende top-level config key", () => {
  assertThrows(
    () =>
      validateConfig({
        ...baseConfig(),
        teacherManuel: {
          inputFiles: ["teachers/manual.md"],
        },
      }),
    Error,
    "Unknown configuration field 'teacherManuel'.",
  );
});

Deno.test("resolveConfig resolveert teacherManual paden", () => {
  const config = {
    ...baseConfig(),
    teacherManual: {
      inputFiles: ["teachers/manual.md"],
      outputName: "teacher-manual.pdf",
      outputDir: "build/teachers",
    },
  } as unknown as BsoConfig;
  const resolved = resolveConfig(config, {}, REPO_ROOT);

  assertEquals(resolved.teacherManual?.inputFiles, [
    "/repo/teachers/manual.md",
  ]);
  assertEquals(resolved.teacherManual?.outputName, "teacher-manual.pdf");
  assertEquals(resolved.teacherManual?.outputDir, "/repo/build/teachers");
});

Deno.test("resolveConfig behoudt opgegeven diagrams-waarden", () => {
  const config = baseConfig({
    krokiUrl: "http://localhost:8000",
    output: "object-base64",
    failOnError: false,
  }) as unknown as BsoConfig;
  const resolved = resolveConfig(config, {}, REPO_ROOT);
  assertEquals(resolved.diagrams.krokiUrl, "http://localhost:8000");
  assertEquals(resolved.diagrams.output, "object-base64");
  assertEquals(resolved.diagrams.failOnError, false);
});

Deno.test("buildKrokiA11yOptions mapt endpoint, output en no-JS opties", () => {
  const options = buildKrokiA11yOptions({
    krokiUrl: "http://localhost:8000",
    output: "inline-svg",
    failOnError: true,
    locale: "nl",
  });

  assertEquals(options.kroki.krokiBase, "http://localhost:8000");
  assertEquals(options.kroki.server, "http://localhost:8000");
  assertEquals(options.kroki.output, "inline-svg");
  assertEquals(options.kroki.target, "html");
  assertEquals(options.kroki.alias, ["plantuml", "mermaid"]);
  assertEquals(options.languages, ["plantuml", "mermaid", "kroki"]);
  assertEquals(options.showDiagramModeToggle, false);
  assertEquals(options.showDiagramLegend, false);
  assertEquals("lang" in options.kroki, false);
  assertEquals("imgRefDir" in options.kroki, false);
  assertEquals("imgDir" in options.kroki, false);
});

Deno.test("buildKrokiA11yOptions levert gelokaliseerde templates met placeholders", () => {
  const nl = buildKrokiA11yOptions({
    krokiUrl: "https://kroki.io",
    output: "img-html-base64",
    failOnError: true,
    locale: "nl",
  });
  const en = buildKrokiA11yOptions({
    krokiUrl: "https://kroki.io",
    output: "img-html-base64",
    failOnError: true,
    locale: "en",
  });

  assertEquals(nl.summaryText, '{type} broncode voor "{title}"');
  assertEquals(nl.a11ySummaryText, '"{title}" in natuurlijke taal');
  assertEquals(nl.tabSourceLabel, "Bron");
  assertEquals(nl.tabA11yLabel, "In natuurlijke taal");

  assertEquals(en.summaryText, '{type} source for "{title}"');
  assertEquals(en.a11ySummaryText, '"{title}" in natural language');
  assertEquals(en.tabSourceLabel, "Source");
  assertEquals(en.tabA11yLabel, "In natural language");
});

// ---------------------------------------------------------------------------
// Ongeldige diagrams-config
// ---------------------------------------------------------------------------

Deno.test("validateConfig gooit bij een niet-object diagrams", () => {
  assertThrows(
    () => validateConfig(baseConfig("not-an-object")),
    Error,
    "'diagrams' must be an object",
  );
});

Deno.test("validateConfig gooit bij een array als diagrams", () => {
  assertThrows(
    () => validateConfig(baseConfig([])),
    Error,
    "'diagrams' must be an object",
  );
});

Deno.test("validateConfig gooit bij een niet-parseerbare krokiUrl", () => {
  assertThrows(
    () => validateConfig(baseConfig({ krokiUrl: "not a url" })),
    Error,
    "must be a valid URL",
  );
});

Deno.test("validateConfig gooit bij een niet-string krokiUrl", () => {
  assertThrows(
    () => validateConfig(baseConfig({ krokiUrl: 123 })),
    Error,
    "'diagrams.krokiUrl' must be a string",
  );
});

Deno.test("validateConfig gooit bij een ongeldige output-waarde", () => {
  assertThrows(
    () => validateConfig(baseConfig({ output: "png" })),
    Error,
    "'diagrams.output' must be one of",
  );
});

Deno.test("validateConfig gooit bij een niet-boolean failOnError", () => {
  assertThrows(
    () => validateConfig(baseConfig({ failOnError: "yes" })),
    Error,
    "'diagrams.failOnError' must be a boolean",
  );
});

Deno.test("validateConfig gooit bij een niet-object quiz-config", () => {
  assertThrows(
    () => validateConfig({ ...baseConfig(), quiz: "not-an-object" }),
    Error,
    "'quiz' must be an object",
  );
});

Deno.test("validateConfig accepteert 0 als onbeperkte quiz maxAttempts", () => {
  assertEquals(
    validateConfig({ ...baseConfig(), quiz: { maxAttempts: 0 } }),
    true,
  );
});

Deno.test("validateConfig gooit bij een negatieve quiz maxAttempts", () => {
  assertThrows(
    () => validateConfig({ ...baseConfig(), quiz: { maxAttempts: -1 } }),
    Error,
    "'quiz.maxAttempts' must be a non-negative integer",
  );
});

Deno.test("validateConfig gooit bij een niet-integer quiz maxAttempts", () => {
  assertThrows(
    () => validateConfig({ ...baseConfig(), quiz: { maxAttempts: 2.5 } }),
    Error,
    "'quiz.maxAttempts' must be a non-negative integer",
  );
});
