/**
 * Source of the printed user manual (#111).
 *
 * The online feature pages are the single source for how a feature works. The
 * manual PDF reuses them: its pages are appended to the manual with the
 * headings shifted down, so the `<details>` blocks (expanded by
 * `assets/details-filter.lua`) and everything else are written once.
 *
 * @module
 */

import { readSidebarPosition } from "./front-matter.ts";

/** Removes a leading YAML front matter block. */
export function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** Moves every heading `by` levels down, except inside fenced code blocks. */
export function shiftHeadings(markdown: string, by: number): string {
  let fence: string | null = null;
  return markdown.split("\n").map((line) => {
    const opening = line.match(/^\s*(`{3,}|~{3,})/);
    if (opening) {
      if (fence === null) fence = opening[1];
      else if (
        opening[1][0] === fence[0] && opening[1].length >= fence.length
      ) fence = null;
      return line;
    }
    if (fence !== null) return line;
    const heading = line.match(/^(#{1,6})(\s.*)$/);
    if (!heading) return line;
    return "#".repeat(Math.min(6, heading[1].length + by)) + heading[2];
  }).join("\n");
}

/**
 * Flashcard containers are interactive online and plain text in print: the
 * `:::flashcard` fences go and the `term:` line becomes a bold term above its
 * definition. Fenced code (the "how" examples) stays literal.
 */
export function flashcardsForPrint(markdown: string): string {
  let fence: string | null = null;
  const lines: string[] = [];
  for (const line of markdown.split("\n")) {
    const opening = line.match(/^\s*(`{3,}|~{3,})/);
    if (opening) {
      if (fence === null) fence = opening[1];
      else if (
        opening[1][0] === fence[0] && opening[1].length >= fence.length
      ) fence = null;
      lines.push(line);
      continue;
    }
    if (fence !== null) {
      lines.push(line);
      continue;
    }
    if (/^:{3,}\s*flashcards?\s*$/.test(line) || /^:{3,}\s*$/.test(line)) {
      continue;
    }
    const term = line.match(/^term:\s*(.+?)\s*$/);
    lines.push(term ? `**${term[1]}**` : line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** A feature page as read from disk. */
export interface FeaturePage {
  /** File name, used as a tie-breaker in the order. */
  name: string;
  markdown: string;
}

/**
 * The feature chapter for the manual: the `index` page as a chapter intro and
 * the other pages as sections below it, ordered like the online menu
 * (`sidebar_position`, then name). Returns an empty string without pages.
 */
export function buildFeatureChapter(pages: FeaturePage[]): string {
  const index = pages.find((page) => page.name === "index.md");
  const others = pages.filter((page) => page.name !== "index.md").sort(
    (a, b) => {
      const left = readSidebarPosition(a.markdown) ?? Number.POSITIVE_INFINITY;
      const right = readSidebarPosition(b.markdown) ?? Number.POSITIVE_INFINITY;
      return left === right ? a.name.localeCompare(b.name) : left - right;
    },
  );
  if (!index && others.length === 0) return "";
  const parts: string[] = [];
  if (index) {
    parts.push(
      shiftHeadings(flashcardsForPrint(stripFrontMatter(index.markdown)), 1)
        .trim(),
    );
  }
  for (const page of others) {
    parts.push(
      shiftHeadings(
        flashcardsForPrint(stripFrontMatter(page.markdown)),
        index ? 2 : 1,
      ).trim(),
    );
  }
  return parts.join("\n\n") + "\n";
}

/** Reads the Markdown pages of a feature folder; empty when it does not exist. */
export async function loadFeaturePages(dir: string): Promise<FeaturePage[]> {
  const pages: FeaturePage[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      pages.push({
        name: entry.name,
        markdown: await Deno.readTextFile(`${dir}/${entry.name}`),
      });
    }
  } catch {
    return [];
  }
  return pages.sort((a, b) => a.name.localeCompare(b.name));
}
