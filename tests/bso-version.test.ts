import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { checkBsoVersion, validateConfig } from "../src/config-loader.ts";
import type { BsoConfig } from "../src/types.ts";

const base: BsoConfig = { courseName: "C", version: "1.0.0", sourcesDir: "lessons/" };

Deno.test("bsoVersion: accepted by validateConfig", () => {
  assertEquals(validateConfig({ ...base, bsoVersion: "0.36.0" }), true);
});

Deno.test("bsoVersion: must be a string", () => {
  assertThrows(() => validateConfig({ ...base, bsoVersion: 36 }), Error, "bsoVersion");
});

Deno.test("checkBsoVersion: absent field is not checked", () => {
  checkBsoVersion(base, "0.36.0", "brightspacosaurus.config.json");
});

Deno.test("checkBsoVersion: equal versions pass", () => {
  checkBsoVersion({ ...base, bsoVersion: "0.36.0" }, "0.36.0", "x.json");
});

Deno.test("checkBsoVersion: mismatch names both versions and both ways out", () => {
  const error = assertThrows(
    () => checkBsoVersion({ ...base, bsoVersion: "0.35.0" }, "0.36.0", "x.json"),
    Error,
  );
  assertStringIncludes(error.message, "0.35.0");
  assertStringIncludes(error.message, "0.36.0");
  assertStringIncludes(error.message, "install BSO 0.35.0");
  assertStringIncludes(error.message, 'change "bsoVersion"');
});
