import { assertEquals } from "@std/assert";
import { dirname, fromFileUrl, join, resolve } from "@std/path";

const root = join(dirname(fromFileUrl(import.meta.url)), "..");

/** Import specifiers of a TypeScript file, including `import type` and re-exports. */
function specifiers(source: string): string[] {
  return [
    ...source.matchAll(/(?:import|export)\s[^"';]*?from\s+["']([^"']+)["']/g),
  ]
    .map((match) => match[1]);
}

Deno.test({
  name:
    "modules the Docusaurus config loads in Node import no JSR packages, even indirectly",
  permissions: { read: true },
  async fn() {
    const config = await Deno.readTextFile(
      join(root, "demo-course-docs", "docusaurus.config.js"),
    );
    const entries = [...config.matchAll(/["']\.\.\/src\/([\w.-]+\.ts)["']/g)]
      .map((match) => resolve(root, "src", match[1]));
    assertEquals(entries.length > 0, true, "found no ../src/ requires");

    // Node resolves npm packages from node_modules; `@std/*` and `jsr:` imports
    // only exist for Deno, so `bso preview` fails with "Cannot find module".
    const problems: string[] = [];
    const seen = new Set<string>();
    async function visit(file: string, via: string): Promise<void> {
      if (seen.has(file)) return;
      seen.add(file);
      const source = await Deno.readTextFile(file);
      for (const specifier of specifiers(source)) {
        if (specifier.startsWith("@std/") || specifier.startsWith("jsr:")) {
          problems.push(
            `${file.slice(root.length + 1)} imports ${specifier} (via ${via})`,
          );
        } else if (specifier.startsWith(".")) {
          await visit(resolve(dirname(file), specifier), via);
        }
      }
    }
    for (const entry of entries) {
      await visit(entry, entry.slice(root.length + 1));
    }
    assertEquals(problems, []);
  },
});
