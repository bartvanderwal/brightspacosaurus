/**
 * Renders the slide decks of the demo course into a static directory for a
 * Docusaurus build without `bso preview`, for example the GitHub Pages
 * workflow, and writes `slides.json`, the map that the build reads from
 * `BSO_PREVIEW_SLIDES` (it makes Alt/Option+P work on the lesson pages).
 * Usage:
 *
 * deno run --config deno.json --allow-read --allow-write=build --allow-env --allow-run=npm demo-course-docs/write-slides-static.ts build/preview-static
 *
 * Marp is installed with npm on first use, next to the static directory.
 */
import { join, resolve } from "@std/path";
import { loadConfig, resolveConfig } from "../src/config-loader.ts";
import { renderPreviewSlides } from "../src/slides-preview.ts";

const target = Deno.args[0];
if (!target) {
  console.error("Usage: write-slides-static.ts <static-dir>");
  Deno.exit(1);
}

const repoRoot = Deno.cwd();
const config = resolveConfig(
  await loadConfig(join(repoRoot, "brightspacosaurus.config.json")),
  {},
  repoRoot,
);
if (!config.slides) {
  console.log("No slides in the configuration; nothing to render.");
  Deno.exit(0);
}
const staticDir = resolve(target);
const rendered = await renderPreviewSlides(
  config.slides,
  repoRoot,
  config.sourcesDir,
  staticDir,
);
await Deno.writeTextFile(
  join(staticDir, "slides.json"),
  JSON.stringify(rendered),
);
console.log(
  `  ✓ ${Object.keys(rendered).length} slide decks in ${target}/slides/`,
);
