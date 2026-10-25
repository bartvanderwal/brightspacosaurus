/**
 * The menu of a course before it is built: which files are in it and in which
 * order (see the Software Guidebook, *Menu order*, rules O1-O10).
 *
 * The order of a module comes from three layers, the most specific wins: the
 * list in the *Overview* section of the module's lead page, then
 * `sidebar_position` in the front matter, then the natural order of the file
 * name. A file that is left out of the list, or that has `draft: true`, is not
 * in the menu and not in the package.
 *
 * @module
 */

import { basename, dirname, relative, resolve } from "@std/path";
import { readDraft, readSidebarPosition } from "./front-matter.ts";
import { isLeadPageStem } from "./manifest-builder.ts";

/** A finding of the menu plan, reported by `bso lint`. */
export interface MenuIssue {
  rule: string;
  severity: "error" | "warning";
  file: string;
  line: number;
  message: string;
}

/** The plan of the menu of a whole course. */
export interface MenuPlan {
  /** Files that are not in the menu: `draft: true`, or not listed in a module that has an overview. */
  excluded: Set<string>;
  /** Index in the overview list of a module, for the listed files. */
  listed: Map<string, number>;
  /** `sidebar_position` of the files that have one. */
  positions: Map<string, number>;
  issues: MenuIssue[];
}

/** The lead page of a module by its file name: `index.md`, `intro.md`, `overview.md`, `weekintro-1.md`, ... */
export function isLeadPageName(fileName: string): boolean {
  return /\.md$/i.test(fileName) &&
    isLeadPageStem(fileName.replace(/\.md$/i, ""));
}

/** A link to a Markdown file in a list item of an overview, with its line. */
export interface OverviewLink {
  target: string;
  line: number;
}

function sectionHeading(text: string): string {
  return text.replace(/^\d+(?:\.\d+)*[.)]?\s+/, "").trim().toLowerCase();
}

/**
 * The links of the overview section of a lead page, in order. A section ends at
 * the next heading of the same or a higher level. Fenced code is ignored.
 * Returns `undefined` when the page has no overview section.
 */
export function overviewLinks(
  markdown: string,
  headings: string[],
): OverviewLink[] | undefined {
  const wanted = new Set(
    headings.map((heading) => heading.trim().toLowerCase()),
  );
  const links: OverviewLink[] = [];
  let inside: number | undefined;
  let found = false;
  let fence: string | undefined;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = undefined;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const depth = heading[1].length;
      if (inside !== undefined && depth <= inside) inside = undefined;
      if (inside === undefined && wanted.has(sectionHeading(heading[2]))) {
        inside = depth;
        found = true;
      }
      continue;
    }
    if (inside === undefined) continue;
    const item = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.*)$/);
    if (!item) continue;
    for (
      const link of item[1].matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)
    ) {
      const target = link[1].split(/[?#]/, 1)[0];
      if (!target || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(target)) continue;
      let decoded = target;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        // keep the raw target
      }
      links.push({ target: decoded, line: index + 1 });
    }
  }
  return found ? links : undefined;
}

/** Input of {@link planMenu}: the files of the course and the headings that mark an overview. */
export interface MenuPlanOptions {
  sourcesDir: string;
  /** Absolute paths of the lesson and the quiz files. */
  files: string[];
  overviewHeadings: string[];
  /** Files that stay in the menu whatever the overview says, such as the teacher page. */
  alwaysIncluded?: string[];
}

/** The first-level folder of a file under `sourcesDir`; the empty string for a file in `sourcesDir` itself. */
function moduleOf(sourcesDir: string, file: string): string {
  const parts = relative(sourcesDir, file).split(/[\\/]/);
  return parts.length > 1 ? parts[0] : "";
}

export async function planMenu(options: MenuPlanOptions): Promise<MenuPlan> {
  const sourcesDir = resolve(options.sourcesDir);
  const files = options.files.map((file) => resolve(file)).sort();
  const known = new Set(files);
  const always = new Set(
    (options.alwaysIncluded ?? []).map((file) => resolve(file)),
  );
  const plan: MenuPlan = {
    excluded: new Set(),
    listed: new Map(),
    positions: new Map(),
    issues: [],
  };
  const texts = new Map<string, string>();
  for (const file of files) texts.set(file, await Deno.readTextFile(file));
  const draft = new Set<string>();
  for (const file of files) {
    const text = texts.get(file)!;
    const position = readSidebarPosition(text);
    if (position !== undefined) plan.positions.set(file, position);
    if (readDraft(text)) draft.add(file);
  }

  // Layer C: the overview of each module.
  const modules = new Map<string, string[]>();
  for (const file of files) {
    const key = moduleOf(sourcesDir, file);
    modules.set(key, [...(modules.get(key) ?? []), file]);
  }
  const listedIn = new Map<string, string>();
  for (const [module, moduleFiles] of modules) {
    const lead = moduleFiles.find((file) => isLeadPageName(basename(file)));
    const links = lead
      ? overviewLinks(texts.get(lead)!, options.overviewHeadings)
      : undefined;
    if (!lead || !links) continue;
    const inThisList = new Set<string>();
    for (const link of links) {
      const target = resolve(dirname(lead), link.target);
      if (!known.has(target)) {
        plan.issues.push({
          rule: "menu-link-missing",
          severity: "error",
          file: lead,
          line: link.line,
          message:
            `The overview lists '${link.target}', but there is no lesson or quiz file at that path.`,
        });
        continue;
      }
      if (inThisList.has(target) || listedIn.has(target)) {
        plan.issues.push({
          rule: "menu-link-twice",
          severity: "error",
          file: lead,
          line: link.line,
          message:
            `'${link.target}' is listed more than once; list a file in one place.`,
        });
        continue;
      }
      inThisList.add(target);
      listedIn.set(target, module);
      plan.listed.set(target, plan.listed.size);
      if (plan.positions.has(target)) {
        plan.issues.push({
          rule: "menu-position-listed",
          severity: "warning",
          file: target,
          line: 1,
          message:
            "This file is in the overview of its module and has a sidebar_position too; the overview wins, so remove one of the two.",
        });
      }
      if (draft.has(target)) {
        plan.issues.push({
          rule: "menu-draft-listed",
          severity: "warning",
          file: lead,
          line: link.line,
          message:
            `'${link.target}' is listed in the overview but has 'draft: true'; it stays out of the menu. Remove it from the list or remove the draft.`,
        });
      }
    }
    // A module with an overview publishes only what the overview lists.
    for (const file of moduleFiles) {
      if (
        file === lead || always.has(file) || inThisList.has(file) ||
        draft.has(file)
      ) continue;
      plan.excluded.add(file);
      plan.issues.push({
        rule: "menu-unlisted",
        severity: "warning",
        file,
        line: 1,
        message:
          "This file is not in the overview of its module, so it is left out of the menu and the package. List it, or mark it 'draft: true' if it is not ready.",
      });
    }
  }
  for (const file of draft) plan.excluded.add(file);

  // Layer B: positions must be unique per folder, and all or none.
  const folders = new Map<string, string[]>();
  for (const file of files) {
    if (plan.excluded.has(file) || plan.listed.has(file)) continue;
    if (isLeadPageName(basename(file)) || always.has(file)) continue;
    folders.set(dirname(file), [...(folders.get(dirname(file)) ?? []), file]);
  }
  for (const [, folderFiles] of folders) {
    const positioned = folderFiles.filter((file) => plan.positions.has(file));
    const seen = new Map<number, string>();
    for (const file of positioned) {
      const position = plan.positions.get(file)!;
      const first = seen.get(position);
      if (first) {
        plan.issues.push({
          rule: "menu-position-duplicate",
          severity: "warning",
          file,
          line: 1,
          message: `sidebar_position ${position} is also used by '${
            basename(first)
          }' in the same folder; give each file its own position.`,
        });
      } else seen.set(position, file);
    }
    if (positioned.length > 0 && positioned.length < folderFiles.length) {
      const without = folderFiles.find((file) => !plan.positions.has(file))!;
      plan.issues.push({
        rule: "menu-position-partial",
        severity: "warning",
        file: without,
        line: 1,
        message:
          "Other files in this folder have a sidebar_position and this one has not; give all of them one, or none.",
      });
    }
  }
  plan.issues.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line ||
    a.rule.localeCompare(b.rule)
  );
  return plan;
}
