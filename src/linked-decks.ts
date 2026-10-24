/**
 * Links from a lesson to a slide deck (#144). A deck link is an ordinary
 * Markdown link to a local `.md` file that is marked as a deck
 * (`slides: true`). Runtime-neutral (no Deno or Node APIs), so the build, the
 * lint and the Docusaurus preview share it.
 *
 * @module
 */

import { isSlideDeck } from "./includes.ts";

/** An inline Markdown link to a local `.md` file. */
export interface MarkdownLink {
  /** The link text. */
  text: string;
  /** The target as written, without anchor. */
  href: string;
  /** Offset of the `[` in the source. */
  index: number;
  /** One-based line of the link. */
  line: number;
}

/** A deck that a lesson links to. */
export interface DeckLink extends MarkdownLink {
  /** Absolute path of the deck file. */
  path: string;
  /** The deck's `title` front matter, else its first H1, else the file name. */
  title: string;
  /** The deck without its front matter. */
  body: string;
}

const INLINE_MD_LINK =
  /(?<!!)\[([^\]]*)\]\(<?([^)\s>]+?\.md)(?:#[^)\s>]*)?>?(?:\s+"[^"]*")?\)/g;

/** Replaces fenced code and inline code by spaces, keeping offsets and lines. */
function maskCode(markdown: string): string {
  const blank = (code: string) => code.replace(/[^\n]/g, " ");
  return markdown
    .replace(
      /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm,
      blank,
    )
    .replace(/`[^`\n]*`/g, blank);
}

/** All inline links to `.md` files outside code. External URLs are skipped. */
export function findMarkdownLinks(markdown: string): MarkdownLink[] {
  const masked = maskCode(markdown);
  const links: MarkdownLink[] = [];
  for (const match of masked.matchAll(INLINE_MD_LINK)) {
    const href = match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    links.push({
      text: match[1],
      href,
      index: match.index!,
      line: masked.slice(0, match.index).split("\n").length,
    });
  }
  return links;
}

/** The title of a deck: front matter `title`, else the first H1, else `fallback`. */
export function deckTitle(markdown: string, fallback: string): string {
  const header = markdown.replace(/^﻿/, "").match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )?.[1];
  const title = header?.match(/^title[ \t]*:[ \t]*["']?(.+?)["']?[ \t]*$/m)
    ?.[1];
  if (title) return title;
  const heading = deckBody(markdown).match(/^#[ \t]+(.+?)[ \t]*$/m)?.[1];
  return heading ?? fallback;
}

/** The deck without its leading front matter. */
export function deckBody(markdown: string): string {
  return markdown.replace(
    /^(?:﻿)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
    "",
  );
}

/**
 * The links of a lesson that lead to a deck, in document order. `resolve`
 * makes an absolute path of a link target; `readFile` returns the file text, or
 * null when the file does not exist.
 */
export function findDeckLinks(
  markdown: string,
  resolve: (href: string) => string,
  readFile: (path: string) => string | null,
  stem: (path: string) => string,
): DeckLink[] {
  const decks: DeckLink[] = [];
  for (const link of findMarkdownLinks(markdown)) {
    const path = resolve(link.href);
    const text = readFile(path);
    if (text === null || !isSlideDeck(text)) continue;
    decks.push({
      ...link,
      path,
      title: deckTitle(text, stem(path)),
      body: deckBody(text).replace(/\r\n/g, "\n").trim(),
    });
  }
  return decks;
}

/**
 * The file name (without folder) of the standalone slides topic of a linked
 * deck, next to the lesson: `<lesson>-slides-<deck>.html`. A leading `slides-`
 * of the deck name is dropped, so `slides-fizzbuzz` gives `...-slides-fizzbuzz`.
 */
export function deckTopicName(lessonStem: string, deckStem: string): string {
  return `${lessonStem}-slides-${deckStem.replace(/^slides-/, "")}`;
}

/**
 * Replaces the target of every inline `.md` link outside code for which
 * `mapHref` returns a new target. An anchor after the target is kept.
 */
export function rewriteLinkTargets(
  markdown: string,
  mapHref: (href: string) => string | undefined,
): string {
  const masked = maskCode(markdown);
  const edits: { start: number; end: number; value: string }[] = [];
  for (const match of masked.matchAll(INLINE_MD_LINK)) {
    const href = match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    const value = mapHref(href);
    if (value === undefined) continue;
    const start = match.index! + match[0].indexOf("](") + 2 +
      (match[0].charAt(match[0].indexOf("](") + 2) === "<" ? 1 : 0);
    edits.push({ start, end: start + href.length, value });
  }
  let result = markdown;
  for (const edit of edits.reverse()) {
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  }
  return result;
}
