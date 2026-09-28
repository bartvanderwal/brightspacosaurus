import { convertMarkdown } from "../../src/markdown-converter.ts";
import { resolve } from "@std/path";

// Serve a real standalone Brightspace export beside the static Docusaurus build.
const result = await convertMarkdown({
  sourcePath: resolve(
    "../examples/demo-course/lessons/week-1/lesson-4-core-concepts.md",
  ),
  outputDir: resolve("build/export"),
  repoRoot: resolve(".."),
});
await Deno.copyFile(result.outputPath, "build/flashcards-export.html");
