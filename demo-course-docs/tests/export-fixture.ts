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
