/**
 * Links from a lesson to a slide deck. A link to a slide deck is an ordinary
 * Markdown link to a local `.md` file whose front matter marks it as a slide
 * slide deck (`slides: true`). This module uses no Deno or Node APIs, so that the
 * build, the lint and the Docusaurus preview can all use it.
 *
 * @module
 */

import { isSlideDeck } from "./includes.ts";

/** An inline Markdown link to a local `.md` file. */
export interface MarkdownLink {
  /** The link text. */
  text: string;
  /** The target of the link as written, without the anchor. */
  href: string;
  /** The position of the opening `[` in the source. */
  index: number;
  /** The line of the link in the source, counting from 1. */
  line: number;
}

/** A slide deck that a lesson links to. */
export interface DeckLink extends MarkdownLink {
  /** The absolute path of the slide deck file. */
  path: string;
  /** The `title` in the front matter of the slide deck, else its first H1, else the file name. */
  title: string;
  /** The slide deck without its front matter. */
  body: string;
}

const INLINE_MD_LINK =
  /(?<!!)\[([^\]]*)\]\(<?([^)\s>]+?\.md)(?:#[^)\s>]*)?>?(?:\s+"[^"]*")?\)/g;

/**
 * Replaces fenced code and inline code by spaces, so that links inside code are
 * not found while the positions and line numbers of everything else stay the same.
 */
function maskCode(markdown: string): string {
  const blank = (code: string) => code.replace(/[^\n]/g, " ");
  return markdown
    .replace(
      /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm,
      blank,
    )
    .replace(/`[^`\n]*`/g, blank);
}

/** All inline links to `.md` files outside code. Links to external URLs are skipped. */
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

/** The title of a slide deck: the `title` in its front matter, else its first H1, else `fallback`. */
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

/** A slide deck without its front matter at the start. */
export function deckBody(markdown: string): string {
  return markdown.replace(
    /^(?:﻿)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
    "",
  );
}

/**
 * The links of a lesson that lead to a slide deck, in the order of the lesson.
 * The function `resolve` turns the target of a link into an absolute path, and
 * `readFile` returns the text of that file, or null when the file does not exist.
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
 * The file name, without folder, of the topic that shows a linked slide deck on
 * its own, next to the lesson: `<lesson>-slides-<deck>.html`. A leading `slides-`
 * in the name of the slide deck is dropped, so `slides-fizzbuzz` gives
 * `<lesson>-slides-fizzbuzz`.
 */
export function deckTopicName(lessonStem: string, deckStem: string): string {
  return `${lessonStem}-slides-${deckStem.replace(/^slides-/, "")}`;
}

/**
 * Replaces the target of every inline link to a `.md` file outside code for
 * which `mapHref` returns a new target. An anchor after the target is kept.
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
