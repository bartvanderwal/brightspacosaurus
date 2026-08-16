import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const testDir = dirname(fromFileUrl(import.meta.url));
const filterPath = join(testDir, "..", "assets", "include-filter.lua");

async function runPandoc(sourcePath: string): Promise<Deno.CommandOutput> {
  return await new Deno.Command("pandoc", {
    args: [sourcePath, `--lua-filter=${filterPath}`, "--to=markdown"],
    stdout: "piped",
    stderr: "piped",
  }).output();
}

Deno.test({
  name: "include-filter voegt Markdown relatief aan het bronbestand in",
  permissions: { read: true, write: true, run: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ prefix: "include_filter_" });
    const partialDir = join(tempDir, "partials");
    const sourceDir = join(tempDir, "hoofdstukken");

    try {
      await Deno.mkdir(partialDir);
      await Deno.mkdir(sourceDir);
      await Deno.writeTextFile(
        join(partialDir, "lesdoelen.md"),
        "- Eerste lesdoel\n- Tweede lesdoel met `code`\n",
      );
      const sourcePath = join(sourceDir, "les.md");
      await Deno.writeTextFile(
        sourcePath,
        "# Les\n\n{@include: ../partials/lesdoelen.md}\n\nAfsluiting.\n",
      );

      const result = await runPandoc(sourcePath);
      const output = new TextDecoder().decode(result.stdout);
      const errorOutput = new TextDecoder().decode(result.stderr);

      assertEquals(result.success, true, errorOutput);
      assertStringIncludes(output, "- Eerste lesdoel");
      assertStringIncludes(output, "- Tweede lesdoel met `code`");
      assertEquals(output.includes("{@include:"), false);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "include-filter faalt bij een ontbrekend include-bestand",
  permissions: { read: true, write: true, run: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({
      prefix: "include_filter_missing_",
    });

    try {
      const sourcePath = join(tempDir, "les.md");
      await Deno.writeTextFile(sourcePath, "{@include: ontbreekt.md}\n");

      const result = await runPandoc(sourcePath);
      const errorOutput = new TextDecoder().decode(result.stderr);

      assertEquals(result.success, false);
      assertStringIncludes(
        errorOutput,
        "include-filter: kan bestand niet lezen",
      );
      assertStringIncludes(errorOutput, "ontbreekt.md");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});
