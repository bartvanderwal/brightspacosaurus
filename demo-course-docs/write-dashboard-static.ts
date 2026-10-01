/**
 * Writes the Voortgangsverkenner files of the demo course into a static
 * directory for a Docusaurus build without `bso preview`, for example the
 * GitHub Pages workflow. Usage:
 *
 * deno run --config deno.json --allow-read --allow-write=build demo-course-docs/write-dashboard-static.ts build/preview-static
 *
 * The demo configuration points to a fictitious GitLab server, so the page
 * shows the dashboard but fetching data fails until a local GitLab exists (#46).
 */
import { join, resolve } from "@std/path";
import { loadConfig, resolveConfig } from "../src/config-loader.ts";
import { writeTeacherDashboard } from "../src/teacher-dashboard.ts";

const target = Deno.args[0];
if (!target) {
  console.error("Usage: write-dashboard-static.ts <static-dir>");
  Deno.exit(1);
}

const repoRoot = Deno.cwd();
const config = resolveConfig(
  await loadConfig(join(repoRoot, "brightspacosaurus.config.json")),
  {},
  repoRoot,
);
if (!config.teacherDashboard) {
  console.log("No teacherDashboard in the configuration; nothing to write.");
  Deno.exit(0);
}
await writeTeacherDashboard(resolve(target, "docenten"), config.teacherDashboard);
console.log(`  ✓ ${join(target, "docenten", "voortgangsverkenner.html")}`);
