import { convertMarkdown } from "../../src/markdown-converter.ts";
import { resolve } from "@std/path";

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
