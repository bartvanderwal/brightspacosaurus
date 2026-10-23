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
import { basename, dirname, join, resolve } from "@std/path";
import { loadConfig, resolveConfig } from "../src/config-loader.ts";
import { renderPreviewSlides } from "../src/slides-preview.ts";

const target = Deno.args[0];
if (!target) {
  console.error("Usage: write-slides-static.ts <static-dir>");
  Deno.exit(1);
}

// One entry per example course on the site: its configuration, and where its
// decks are served (the first course sits at the site root).
const courses = [
  { configFile: "brightspacosaurus.config.json", root: Deno.cwd(), prefix: "" },
  {
    configFile: "examples/cursorisch-aanbod/brightspacosaurus.config.json",
    root: join(Deno.cwd(), "examples", "cursorisch-aanbod"),
    prefix: "cursorisch-aanbod",
  },
];

const staticDir = resolve(target);
const all: Record<string, string> = {};
for (const course of courses) {
  const configPath = join(Deno.cwd(), course.configFile);
  const config = resolveConfig(await loadConfig(configPath), {}, course.root);
  if (!config.slides) continue;
  // Each course renders into its own directory (a run replaces `slides/`);
  // the topic course is moved under its prefix afterwards.
  const own = course.prefix
    ? join(dirname(staticDir), `${basename(staticDir)}-${course.prefix}`)
    : staticDir;
  const rendered = await renderPreviewSlides(
    config.slides,
    Deno.cwd(),
    config.sourcesDir,
    own,
    undefined,
    config.diagrams,
  );
  if (course.prefix) {
    const served = join(staticDir, course.prefix);
    await Deno.mkdir(served, { recursive: true });
    await Deno.remove(join(served, "slides"), { recursive: true }).catch(() =>
      undefined
    );
    await Deno.rename(join(own, "slides"), join(served, "slides"));
  }
  for (const [lesson, url] of Object.entries(rendered)) {
    all[lesson] = course.prefix ? `${course.prefix}/${url}` : url;
  }
}
await Deno.mkdir(staticDir, { recursive: true });
await Deno.writeTextFile(join(staticDir, "slides.json"), JSON.stringify(all));
console.log(`  ✓ ${Object.keys(all).length} slide decks in ${target}/`);
