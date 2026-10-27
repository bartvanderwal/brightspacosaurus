/**
 * The overview list of a lead page, without any file system or runtime API, so
 * the Docusaurus preview (Node) and the build (Deno) read it the same way
 * (see the Software Guidebook, *Menu order*, rule O1).
 *
 * @module
 */

import { isLeadPageStem } from "./manifest-builder.ts";

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

