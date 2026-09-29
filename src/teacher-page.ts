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
