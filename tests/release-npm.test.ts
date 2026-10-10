/**
 * Tests for the npm release fix-ups (#77).
 */
import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { fixPackage } from "../utils/release-npm.ts";

const files = [
  "package.json",
  "src/mod.js",
  "src/mod.d.ts",
  "assets/brightspacosaurus-tabs.js",
  "assets/brightspacosaurus-tabs.d.ts",
  "assets/brightspacosaurus-tabs.d.ts.d.ts",
];

Deno.test("fixPackage adds the types condition for a JS export with a declaration file", () => {
  const { packageJson } = fixPackage({
    exports: {
      ".": {
        types: "./src/mod.d.ts",
        import: "./src/mod.js",
        default: "./src/mod.js",
      },
      "./tabs": {
        import: "./assets/brightspacosaurus-tabs.js",
        default: "./assets/brightspacosaurus-tabs.js",
      },
    },
  }, files);
  assertEquals(packageJson.exports?.["./tabs"], {
    types: "./assets/brightspacosaurus-tabs.d.ts",
    import: "./assets/brightspacosaurus-tabs.js",
    default: "./assets/brightspacosaurus-tabs.js",
  });
  // An existing types condition stays untouched, and stays first.
  assertEquals(Object.keys(packageJson.exports?.["."] as object)[0], "types");
  assertEquals(
    (packageJson.exports?.["."] as Record<string, string>).types,
    "./src/mod.d.ts",
  );
});

Deno.test("fixPackage removes empty .d.ts.d.ts files and adds no types without a declaration", () => {
  const { packageJson, remove } = fixPackage({
    exports: { "./x": { import: "./src/x.js", default: "./src/x.js" } },
  }, files);
  assertEquals(remove, ["assets/brightspacosaurus-tabs.d.ts.d.ts"]);
  assertEquals(packageJson.exports?.["./x"], {
    import: "./src/x.js",
    default: "./src/x.js",
  });
  assertEquals(fixPackage({}, ["package.json"]), {
    packageJson: {},
    remove: [],
  });
});

Deno.test("property: fixPackage is idempotent and only removes .d.ts.d.ts files", () => {
  const name = fc.stringMatching(/^[a-z]{1,8}$/);
  fc.assert(
    fc.property(
      fc.uniqueArray(name, { minLength: 1, maxLength: 6 }),
      fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
      (names, withDeclaration) => {
        const fileList = names.flatMap((n, i) => [
          `src/${n}.js`,
          ...(withDeclaration[i]
            ? [`src/${n}.d.ts`, `src/${n}.d.ts.d.ts`]
            : []),
        ]);
        const input = {
          exports: Object.fromEntries(
            names.map((n) => [`./${n}`, { import: `./src/${n}.js` }]),
          ),
        };
        const once = fixPackage(input, fileList);
        const twice = fixPackage(once.packageJson, fileList);
        assertEquals(twice.packageJson, once.packageJson);
        assertEquals(once.remove.every((f) => f.endsWith(".d.ts.d.ts")), true);
        names.forEach((n, i) => {
          const entry = once.packageJson.exports?.[`./${n}`] as Record<
            string,
            string
          >;
          assertEquals(
            entry.types,
            withDeclaration[i] ? `./src/${n}.d.ts` : undefined,
          );
        });
      },
    ),
    { numRuns: 100 },
  );
});
