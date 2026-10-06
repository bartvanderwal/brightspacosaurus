import { convertMarkdown } from "../../src/markdown-converter.ts";
import { join, resolve } from "@std/path";

const previewStaticDir = resolve("../build/preview-static");
const previewReadersDir = join(previewStaticDir, "readers");
await Deno.mkdir(previewReadersDir, { recursive: true });
await Deno.writeTextFile(
  join(previewReadersDir, "reader-testing-basics.pdf"),
  "%PDF-1.4\n%%EOF\n",
);

// Serve a real standalone Brightspace export beside the static Docusaurus build.
const result = await convertMarkdown({
  sourcePath: resolve(
    "../examples/demo-course/lessons/week-1/lesson-4-core-concepts.md",
  ),
  outputDir: resolve("build/export"),
  repoRoot: resolve(".."),
  flashcards:
    JSON.parse(await Deno.readTextFile("../brightspacosaurus.config.json"))
      .flashcards,
});
await Deno.copyFile(result.outputPath, "build/flashcards-export.html");

// Exported handbook with relative lesson links for the topic navigation test.
const handbook = await convertMarkdown({
  sourcePath: resolve("../examples/demo-course/lessons/README.md"),
  outputDir: resolve("build/export"),
  repoRoot: resolve(".."),
});
await Deno.copyFile(handbook.outputPath, "build/navigation-export.html");
