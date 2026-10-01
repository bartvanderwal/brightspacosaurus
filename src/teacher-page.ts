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

/** Shown instead of the tabs when the dashboard cannot be embedded. */
export const DASHBOARD_NOT_CONFIGURED_NOTE =
  "Voortgangsverkenner: niet geconfigureerd. Voeg teacherDashboard toe aan brightspacosaurus.config.json.";

/** Options for {@link remarkTeacherDashboard}. */
export interface TeacherDashboardTabsOptions {
  /** URL of the dashboard page, relative or absolute; null shows `note`. */
  src: string | null;
  /** Text shown when `src` is null. */
  note?: string;
}

/** Minimal mdast node shape used by this plugin. */
interface MdNode {
  type: string;
  depth?: number;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

function text(value: string): MdNode {
  return { type: "text", value };
}

function el(tag: string, properties: Record<string, unknown>, children: MdNode[] = []): MdNode {
  return { type: "bsoTeacherTabsElement", data: { hName: tag, hProperties: properties }, children };
}

function isDirective(node: MdNode): boolean {
  if (node.type !== "paragraph" || node.children?.length !== 1) return false;
  const only = node.children[0];
  return only.type === "text" && only.value?.trim() === DASHBOARD_DIRECTIVE;
}

/** The page title: an H1, or a wrapper around only an H1 (Docusaurus adds a <header>). */
function isPageTitle(node: MdNode): boolean {
  if (node.type === "heading") return node.depth === 1;
  return node.children?.length === 1 && isPageTitle(node.children[0]);
}

/**
 * Remark plugin for the teacher page: `{@bso-teacher-dashboard}` on its own
 * line turns the page into two tabs, *Informatie* (the rest of the page) and
 * *Voortgangsverkenner* (the dashboard in an iframe). The first H1 stays above
 * the tabs. Without JavaScript both panels show one after the other;
 * assets/brightspacosaurus-tabs.js adds the tab behaviour. Built from
 * hName/hProperties nodes, so the Brightspace export and the Docusaurus
 * preview render the same markup (dev/prod parity).
 */
export function remarkTeacherDashboard(
  options: TeacherDashboardTabsOptions,
): (tree: MdNode) => void {
  return (tree: MdNode) => {
    const children = tree.children ?? [];
    const at = children.findIndex(isDirective);
    if (at < 0) return;

    if (!options.src) {
      children[at] = {
        type: "blockquote",
        children: [{ type: "paragraph", children: [text(options.note ?? DASHBOARD_NOT_CONFIGURED_NOTE)] }],
      };
      return;
    }

    const rest = children.filter((node, i) => i !== at && !isDirective(node));
    const lead = rest.filter((node) => node.type === "yaml");
    const h1 = rest.find(isPageTitle);
    const info = rest.filter((node) => node.type !== "yaml" && node !== h1);

    const tab = (id: string, panel: string, label: string, selected: boolean) =>
      el("button", {
        type: "button",
        role: "tab",
        id,
        ariaControls: panel,
        ariaSelected: selected ? "true" : "false",
        tabIndex: selected ? 0 : -1,
      }, [text(label)]);

    const tabs = el("div", { className: ["bso-tabs"], dataBsoTabs: "" }, [
      el("div", { className: ["bso-tablist"], role: "tablist", ariaLabel: "Docentpagina", hidden: true }, [
        tab("bso-tab-info", "bso-panel-info", "Informatie", true),
        tab("bso-tab-dashboard", "bso-panel-dashboard", "Voortgangsverkenner", false),
      ]),
      el("section", {
        className: ["bso-tabpanel"],
        id: "bso-panel-info",
        role: "tabpanel",
        ariaLabelledBy: "bso-tab-info",
      }, info),
      el("section", {
        className: ["bso-tabpanel"],
        id: "bso-panel-dashboard",
        role: "tabpanel",
        ariaLabelledBy: "bso-tab-dashboard",
      }, [
        el("h2", { className: ["bso-tabpanel-title"] }, [text("Voortgangsverkenner")]),
        el("iframe", {
          className: ["bso-dashboard-frame"],
          src: options.src,
          title: "Voortgangsverkenner",
          loading: "lazy",
        }),
        el("p", { className: ["bso-dashboard-newtab"] }, [
          el("a", { href: options.src, target: "_blank", rel: ["noopener", "noreferrer"] }, [
            text("Open de Voortgangsverkenner in een nieuw tabblad"),
          ]),
        ]),
      ]),
    ]);

    tree.children = [...lead, ...(h1 ? [h1] : []), tabs];
  };
}
