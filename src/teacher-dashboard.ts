/**
 * Writes the Voortgangsverkenner (teacher progress dashboard, #37) into a
 * directory: the page with the embedded `teacherDashboard` configuration, its
 * scripts and styles, and the vendored libraries and fonts. Used by `prepare`
 * (into the instructor module) and by `preview` (into a static directory of
 * the Docusaurus preview), so both show the same dashboard.
 *
 * @module
 */
import { join } from "@std/path";
import { loadAssetBytes, loadAssetText } from "./assets.ts";
import type { ResolvedTeacherDashboardConfig } from "./types.ts";

/** File name of the dashboard page inside the target directory. */
export const DASHBOARD_PAGE = "voortgangsverkenner.html";

const TEXT_FILES = ["style.css", "calc.js", "app.js"];
const VENDOR_SCRIPTS = [
  "react.production.min.js",
  "react-dom.production.min.js",
  "htm.umd.js",
];
const FONTS = [
  "atkinson-hyperlegible-next-latin.woff2",
  "atkinson-hyperlegible-mono-latin.woff2",
];

/** Writes the dashboard files into `targetDir` (created when missing). */
export async function writeTeacherDashboard(
  targetDir: string,
  dashboard: ResolvedTeacherDashboardConfig,
): Promise<void> {
  await Deno.mkdir(join(targetDir, "vendor", "fonts"), { recursive: true });

  const template = await loadAssetText("teacher-dashboard/index.html");
  const configJson = JSON.stringify(dashboard, null, 2);
  await Deno.writeTextFile(
    join(targetDir, DASHBOARD_PAGE),
    template.replace(
      /<script id="bso-dashboard-config" type="application\/json">[\s\S]*?<\/script>/,
      `<script id="bso-dashboard-config" type="application/json">\n${configJson}\n  </script>`,
    ),
  );
  for (const file of TEXT_FILES) {
    await Deno.writeTextFile(join(targetDir, file), await loadAssetText(`teacher-dashboard/${file}`));
  }
  for (const file of VENDOR_SCRIPTS) {
    await Deno.writeTextFile(
      join(targetDir, "vendor", file),
      await loadAssetText(`teacher-dashboard/vendor/${file}`),
    );
  }
  for (const font of FONTS) {
    await Deno.writeFile(
      join(targetDir, "vendor", "fonts", font),
      await loadAssetBytes(`teacher-dashboard/vendor/fonts/${font}`),
    );
  }
  await Deno.writeTextFile(
    join(targetDir, "vendor", "fonts", "OFL.txt"),
    await loadAssetText("teacher-dashboard/vendor/fonts/OFL.txt"),
  );
}
