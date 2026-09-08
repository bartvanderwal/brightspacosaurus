/**
 * Unit tests voor validatie en resolutie van het `diagrams`-config-object.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { assertEquals, assertThrows } from "@std/assert";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
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
