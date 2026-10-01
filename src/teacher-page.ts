/**
 * Teacher page: an author-written page (default `for-teachers.md` in
 * `sourcesDir`) on which BSO fills in the imported course and BSO versions.
 * Runtime-neutral (no Deno or Node APIs) so the Brightspace export and the
 * Docusaurus preview share it.
 *
 * Issue: #38
 *
 * @module
 */

/** Default teacher page, relative to `sourcesDir`. */
export const DEFAULT_TEACHER_PAGE = "for-teachers.md";

/** Directive line that BSO replaces with the version table. */
export const VERSIONS_DIRECTIVE = "{@bso-versions}";

/** Versions shown on the teacher page. */
export interface TeacherPageVersions {
  /** Course name from the BSO configuration. */
  courseName: string;
  /** Course content version (`version` in the BSO configuration). */
  courseVersion: string;
  /** Brightspacosaurus package version. */
  bsoVersion: string;
}

/** Validates a configured teacher page path; returns it trimmed. */
export function resolveTeacherPage(value?: unknown): string {
  if (value === undefined) return DEFAULT_TEACHER_PAGE;
  if (
    typeof value !== "string" || !value.trim().endsWith(".md") ||
    value.trim().startsWith("/") || value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(
      "Field 'teacherPage' must be a relative path to a .md file inside 'sourcesDir'.",
    );
  }
  return value.trim();
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/`/g, "");
}

/** Markdown table with the course and BSO versions. */
export function renderVersionTable(versions: TeacherPageVersions): string {
  return [
    "| Component | Version |",
    "| --- | --- |",
    `| ${escapeCell(versions.courseName)} | \`${
      escapeCell(versions.courseVersion)
    }\` |`,
    `| Brightspacosaurus | \`${escapeCell(versions.bsoVersion)}\` |`,
  ].join("\n");
}

/**
 * Replaces every `{@bso-versions}` line with the version table. Without a
 * directive, the table follows the first H1 (after frontmatter), or starts
 * the page when there is no H1. Fenced code blocks are left untouched.
 */
export function insertVersionTable(
  markdown: string,
  versions: TeacherPageVersions,
): string {
  const table = renderVersionTable(versions);
  const lines = markdown.split("\n");
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end > 0) start = end + 1;
  }

  let fence: string | null = null;
  let firstH1 = -1;
  let replaced = false;
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const marker = trimmed.match(/^(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (marker) fence = marker;
    else if (trimmed === VERSIONS_DIRECTIVE) {
      lines[i] = table;
      replaced = true;
    } else if (firstH1 < 0 && /^#\s/.test(trimmed)) firstH1 = i;
  }
  if (replaced) return lines.join("\n");

  const at = firstH1 >= 0 ? firstH1 + 1 : start;
  lines.splice(at, 0, "", table, "");
  return lines.join("\n");
}

/** Directive that embeds the Voortgangsverkenner on the teacher page (#37). */
export const DASHBOARD_DIRECTIVE = "{@bso-teacher-dashboard}";

/** Placeholder paragraph the converter turns into the tabbed layout. */
export const DASHBOARD_MARKER = "BSO-TEACHER-DASHBOARD-PLACEHOLDER";

/**
 * Replaces every `{@bso-teacher-dashboard}` line outside fenced code blocks.
 * Returns the new Markdown and whether a directive was found.
 */
export function replaceDashboardDirective(
  markdown: string,
  replacement: string,
): { markdown: string; found: boolean } {
  const lines = markdown.split("\n");
  let fence: string | null = null;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const marker = trimmed.match(/^(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (marker) fence = marker;
    else if (trimmed === DASHBOARD_DIRECTIVE) {
      lines[i] = replacement;
      found = true;
    }
  }
  return { markdown: lines.join("\n"), found };
}

/** Docusaurus preview: the dashboard only works after import in Brightspace. */
export const DASHBOARD_PREVIEW_NOTE = [
  "",
  ":::note[Voortgangsverkenner]",
  "",
  "Hier staat na import in Brightspace de Voortgangsverkenner, in een eigen tabblad naast deze informatie. In deze preview is hij niet beschikbaar.",
  "",
  ":::",
  "",
].join("\n");

/** Brightspace export without `teacherDashboard` in the configuration. */
export const DASHBOARD_NOT_CONFIGURED_NOTE =
  "> **Voortgangsverkenner:** niet geconfigureerd. Voeg `teacherDashboard` toe aan `brightspacosaurus.config.json`.";

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Wraps the teacher page body in two tabs: the page itself ("Informatie") and
 * the Voortgangsverkenner in an iframe. The page's first H1 stays above the
 * tabs. Without JavaScript both panels are shown one after the other; the
 * tab script (assets/brightspacosaurus-tabs.js) turns them into tabs.
 */
export function wrapTeacherPageTabs(bodyHtml: string, dashboardSrc: string): string {
  const withoutMarker = bodyHtml.replace(
    new RegExp(`<p>\\s*${DASHBOARD_MARKER}\\s*</p>\\n?`, "g"),
    "",
  );
  const h1 = withoutMarker.match(/<h1[^>]*>[\s\S]*?<\/h1>\n?/);
  const heading = h1 ? h1[0] : "";
  const info = h1 ? withoutMarker.replace(h1[0], "") : withoutMarker;
  const src = escapeAttribute(dashboardSrc);
  return `${heading}<div class="bso-tabs" data-bso-tabs>
<div class="bso-tablist" role="tablist" aria-label="Docentpagina" hidden>
<button type="button" role="tab" id="bso-tab-info" aria-controls="bso-panel-info" aria-selected="true">Informatie</button>
<button type="button" role="tab" id="bso-tab-dashboard" aria-controls="bso-panel-dashboard" aria-selected="false" tabindex="-1">Voortgangsverkenner</button>
</div>
<section class="bso-tabpanel" id="bso-panel-info" role="tabpanel" aria-labelledby="bso-tab-info">
${info}
</section>
<section class="bso-tabpanel" id="bso-panel-dashboard" role="tabpanel" aria-labelledby="bso-tab-dashboard">
<h2 class="bso-tabpanel-title">Voortgangsverkenner</h2>
<iframe class="bso-dashboard-frame" src="${src}" title="Voortgangsverkenner" loading="lazy"></iframe>
<p class="bso-dashboard-newtab"><a href="${src}" target="_blank" rel="noopener noreferrer">Open de Voortgangsverkenner in een nieuw tabblad</a></p>
</section>
</div>`;
}
