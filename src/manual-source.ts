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

/**
 * Numbers the headings of the feature chapter like the other chapters of the manual:
 * the chapter (`##`) gets `chapter`, the headings below it `12.1`, `12.1.1`, and so on. Code
 * fences are left alone, and a heading that already starts with a number is not numbered again.
 */
export function numberHeadings(markdown: string, chapter: number): string {
  const counters: number[] = [];
  let fence: string | undefined;
  return markdown.split("\n").map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = undefined;
      return line;
    }
    if (fence) return line;
    const heading = line.match(/^(#{2,6})\s+(.*)$/);
    if (!heading) return line;
    const depth = heading[1].length - 1;
    if (/^\d+(?:\.\d+)*\.?\s/.test(heading[2])) return line;
    counters.length = depth;
    for (let i = 0; i < depth; i++) counters[i] = counters[i] ?? 0;
    counters[depth - 1] = (counters[depth - 1] ?? 0) + 1;
    const number = depth === 1
      ? `${chapter}.`
      : `${chapter}.${counters.slice(1, depth).join(".")}`;
    return `${heading[1]} ${number} ${heading[2]}`;
  }).join("\n");
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

/** The title block at the top of a manual, and the Markdown that follows it. */
export interface ManualTitleBlock {
  title?: string;
  subtitle?: string;
  author?: string;
  version?: string;
  /** The manual without its title block, so the PDF starts at the first chapter. */
  body: string;
}

/**
 * Splits the title block (`# Title`, a subtitle line and `- *Author(s)*: ...` /
 * `- *Version*: ...` items) from the first `##` chapter. The PDF gets a real
 * cover page from these values, so the block must not appear again in the body.
 */
export function splitManualTitleBlock(markdown: string): ManualTitleBlock {
  const source = stripFrontMatter(markdown);
  const lines = source.split("\n");
  const chapter = lines.findIndex((line) => /^##\s/.test(line));
  const head = lines.slice(0, chapter < 0 ? lines.length : chapter);
  const title = head.find((line) => /^#\s/.test(line))?.replace(/^#\s+/, "")
    .trim();
  if (!title) return { body: source };
  const field = (pattern: RegExp) =>
    head.map((line) => line.match(pattern)?.[1].trim()).find(Boolean);
  const subtitle = head.find((line) => line.trim() && !/^(#\s|-\s)/.test(line))
    ?.trim();
  return {
    title,
    subtitle,
    author: field(
      /^-\s+\*(?:Author\(s\)|Author|Auteur\(s\)|Auteur)\*:\s*(.+)$/,
    ),
    version: field(/^-\s+\*(?:Version|Versie)\*:\s*(.+)$/),
    body: chapter < 0 ? "" : lines.slice(chapter).join("\n"),
  };
}
