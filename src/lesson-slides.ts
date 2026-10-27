import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { isSourcesHeading } from "./reader-headings.ts";

interface MarkdownNode {
  type: string;
  depth?: number;
  lang?: string;
  ordered?: boolean;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: {
    start: { offset?: number; line?: number };
    end: { offset?: number; line?: number };
  };
}

/** Fence languages the preview renders to a picture (see `renderDiagramFences`). */
const DIAGRAM_LANGUAGES = ["plantuml", "mermaid"];
/** Lines of code that fit on one slide; longer code continues on the next slide. */
const MAX_CODE_LINES = 16;
const MAX_LIST_ITEMS = 6;
const MAX_SLIDE_LINES = 12;

interface SlideBlock {
  markdown: string;
  separate?: boolean;
}

function nodeText(node: MarkdownNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function sourceFor(node: MarkdownNode, source: string): string {
  const { start, end } = node.position ?? { start: {}, end: {} };
  if (start.offset === undefined || end.offset === undefined) return "";
  return source.slice(start.offset, end.offset).trim();
}

function lineCount(value: string): number {
  return value.split("\n").length;
}

function isCoreConcepts(heading: string): boolean {
  const normalized = heading.trim().replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .toLowerCase();
  return normalized === "kernbegrippen" || normalized === "core concepts";
}

function glossaryTerms(list: MarkdownNode): string[] | undefined {
  const items = list.children ?? [];
  if (!items.length) return undefined;
  const terms: string[] = [];
  for (const item of items) {
    const firstParagraph = item.children?.find((child) =>
      child.type === "paragraph"
    );
    if (!firstParagraph) return undefined;
    const text = nodeText(firstParagraph);
    const colon = text.indexOf(":");
    const term = text.slice(0, colon).trim();
    if (colon < 0 || !term || !text.slice(colon + 1).trim()) {
      return undefined;
    }
    terms.push(term);
  }
  return terms;
}

function listBlocks(
  node: MarkdownNode,
  source: string,
  coreConcepts: boolean,
): SlideBlock[] {
  const items = node.children ?? [];
  if (coreConcepts) {
    const terms = glossaryTerms(node);
    if (terms) {
      const itemSources = items.map((item) => sourceFor(item, source)).filter(
        Boolean,
      );
      return [
        { markdown: `- ${terms.join("\n- ")}` },
        ...itemSources.map((markdown) => ({ markdown, separate: true })),
      ];
    }
  }
  const blocks: SlideBlock[] = [];
  const separate = items.length > MAX_LIST_ITEMS;
  for (let index = 0; index < items.length; index += MAX_LIST_ITEMS) {
    const chunk = items.slice(index, index + MAX_LIST_ITEMS)
      .map((item) => sourceFor(item, source)).filter(Boolean);
    if (chunk.length) blocks.push({ markdown: chunk.join("\n"), separate });
  }
  return blocks;
}

/** The cells of a table row line, without the outer `|`. */
function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/**
 * How many lines a table row takes on a slide: a long cell wraps, so it counts
 * as several lines (about 130 characters fit on a line, shared by the columns).
 */
function rowLines(line: string, columns: number): number {
  const perLine = Math.max(14, Math.floor(130 / Math.max(1, columns)));
  const longest = Math.max(0, ...tableCells(line).map((cell) => cell.length));
  return Math.max(1, Math.ceil(longest / perLine));
}

/**
 * A table that fits on a slide stays in one piece; a longer one continues on
 * further slides with its header line repeated. The length counts the wrapped
 * lines of long cells, not only the rows.
 */
function tableBlocks(node: MarkdownNode, source: string): SlideBlock[] {
  const value = sourceFor(node, source);
  if (!value) return [];
  const lines = value.split("\n");
  const header = lines.slice(0, 2);
  const rows = lines.slice(2);
  const columns = tableCells(header[0]).length;
  // The header row and the line under it count too.
  const headerLines = rowLines(header[0], columns) + 1;
  const weights = rows.map((row) => rowLines(row, columns));
  if (
    headerLines + weights.reduce((sum, weight) => sum + weight, 0) <=
      MAX_SLIDE_LINES
  ) {
    return [{ markdown: value }];
  }
  const blocks: SlideBlock[] = [];
  let chunk: string[] = [];
  let used = headerLines;
  for (const [index, row] of rows.entries()) {
    if (chunk.length && used + weights[index] > MAX_SLIDE_LINES) {
      blocks.push({
        markdown: [...header, ...chunk].join("\n"),
        separate: true,
      });
      chunk = [];
      used = headerLines;
    }
    chunk.push(row);
    used += weights[index];
  }
  if (chunk.length) {
    blocks.push({ markdown: [...header, ...chunk].join("\n"), separate: true });
  }
  return blocks;
}

/** A code block on its own slide; code longer than {@link MAX_CODE_LINES} continues on further slides. */
function codeBlocks(node: MarkdownNode, source: string): SlideBlock[] {
  const fence = sourceFor(node, source).split("\n");
  const opening = fence[0];
  const marker = opening.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? "```";
  const closing = fence.at(-1)?.trim().startsWith(marker[0])
    ? fence.pop()!
    : marker;
  const body = fence.slice(1);
  const blocks: SlideBlock[] = [];
  for (
    let index = 0;
    index < Math.max(body.length, 1);
    index += MAX_CODE_LINES
  ) {
    blocks.push({
      markdown: [
        opening,
        ...body.slice(index, index + MAX_CODE_LINES),
        closing,
      ].join("\n"),
      separate: true,
    });
  }
  return blocks;
}

function sectionBlocks(
  nodes: MarkdownNode[],
  source: string,
  coreConcepts: boolean,
): SlideBlock[] {
  const blocks: SlideBlock[] = [];
  for (const node of nodes) {
    if (node.type === "list") {
      blocks.push(...listBlocks(node, source, coreConcepts));
    } else if (node.type === "table") {
      blocks.push(...tableBlocks(node, source));
    } else if (
      node.type === "code" && !DIAGRAM_LANGUAGES.includes(node.lang ?? "")
    ) {
      blocks.push(...codeBlocks(node, source));
    } else if (
      node.type === "code" && DIAGRAM_LANGUAGES.includes(node.lang ?? "")
    ) {
      // A diagram is a picture: it gets a slide of its own, rendered later.
      const fence = sourceFor(node, source);
      if (fence) blocks.push({ markdown: fence, separate: true });
    } else if (node.type === "paragraph") {
      for (const child of node.children ?? []) {
        if (child.type === "image" || child.type === "imageReference") {
          const image = sourceFor(child, source);
          if (image) blocks.push({ markdown: image });
        }
      }
    } else if (node.type === "image" || node.type === "imageReference") {
      const image = sourceFor(node, source);
      if (image) blocks.push({ markdown: image });
    }
  }
  return blocks;
}

function renderSection(heading: string, blocks: SlideBlock[]): string[] {
  const bodies: string[] = [];
  let body: string[] = [];
  const flush = () => {
    if (body.length) bodies.push(body.join("\n\n"));
    body = [];
  };
  for (const block of blocks) {
    if (block.separate) {
      flush();
      bodies.push(block.markdown);
      continue;
    }
    if (
      body.length &&
      lineCount([...body, block.markdown].join("\n\n")) > MAX_SLIDE_LINES
    ) {
      flush();
    }
    body.push(block.markdown);
  }
  if (body.length) flush();
  if (!bodies.length) return [`# ${heading}`];
  // A section that continues on more slides says so in the heading, e.g. "(2/3)".
  return bodies.map((markdown, index) =>
    `# ${heading}${
      bodies.length > 1 ? ` (${index + 1}/${bodies.length})` : ""
    }\n\n${markdown}`
  );
}

/** Options for {@link generateLessonSlides}. */
export interface LessonSlidesOptions {
  /** Language of the words for appendices (`Bijlage`, `Appendix`); default `nl`. */
  locale?: "nl" | "en";
  /**
   * Title of a contents slide, listing the lesson's sections right after the
   * title slide. Omitted: no contents slide. Left out for a lesson with fewer
   * than two sections, where it would list nothing useful.
   */
  contentsTitle?: string;
  /**
   * Looks up the slide deck that a link in the lesson points to. It returns
   * undefined for an ordinary link. The slides of the slide deck are inserted
   * after the last slide of the section that contains the link, and its title
   * becomes an entry in the contents slide. A slide deck that is linked more
   * than once is inserted at the first link only; the `id` tells slide decks
   * apart.
   */
  linkedDeck?: (url: string) => LinkedDeckSlides | undefined;
  /**
   * Looks up the lesson page that a link points to when the slides of that page
   * must be nested in this slide deck (the `nest` setting). It returns
   * undefined for an ordinary link. Nesting goes one level deep: the links of a
   * nested page are not followed.
   */
  nestedPage?: (url: string) => NestedPage | undefined;
}

/** A lesson page whose generated slides are nested in the slide deck of an overview page. */
export interface NestedPage {
  /** Identifies the page, so that it is nested only once. */
  id: string;
  /**
   * The Markdown of the page, with its includes expanded and its image paths
   * written relative to the overview page.
   */
  source: string;
}

/** A slide deck that the lesson links to, in the form the slide generator needs. */
export interface LinkedDeckSlides {
  /** Identifies the slide deck, so that it is inserted only once. */
  id: string;
  /** The text of the entry for this slide deck in the contents slide. */
  title: string;
  /** The slides of the slide deck as Markdown, without its front matter. */
  markdown: string;
}

function linkUrls(node: MarkdownNode): string[] {
  const own = node.type === "link" && node.url ? [node.url] : [];
  return [...own, ...(node.children ?? []).flatMap(linkUrls)];
}

/** Derive a preview-only Marp slide deck from the lesson's H1, H2s, lists, images and diagrams. */
interface LessonSection {
  heading: string;
  nodes: MarkdownNode[];
  blocks: SlideBlock[];
  decks: LinkedDeckSlides[];
  nested: NestedSet[];
}

/**
 * A lesson page whose slides have been generated, ready to be placed in the
 * slide deck of an overview page (spec *Nested lesson pages*).
 */
interface NestedSet {
  /** The id of the page, to find its divider slide from a link. */
  id: string;
  /**
   * The number of this set, such as `2.1` under a section numbered `2.`. It is
   * empty when the section has no number.
   */
  number: string;
  title: string;
  slides: string[];
}

interface ParsedLesson {
  tree: { children: MarkdownNode[] };
  title: MarkdownNode;
  introNodes: MarkdownNode[];
  sections: LessonSection[];
}

function parseLesson(source: string): ParsedLesson {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(
    source,
  ) as unknown as { children: MarkdownNode[] };
  const title = tree.children.find((node) =>
    node.type === "heading" && node.depth === 1
  );
  if (!title) {
    throw new Error("Generated lesson slides require an H1 lesson title.");
  }
  const sections: LessonSection[] = [];
  const introNodes: MarkdownNode[] = [];
  let section: LessonSection | undefined;
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      section = {
        heading: nodeText(node).trim(),
        nodes: [],
        blocks: [],
        decks: [],
        nested: [],
      };
      sections.push(section);
    } else if (section) {
      section.nodes.push(node);
    } else if (node !== title) {
      introNodes.push(node);
    }
  }
  for (const each of sections) {
    each.blocks = sectionBlocks(
      each.nodes,
      source,
      isCoreConcepts(each.heading),
    );
  }
  return { tree, title, introNodes, sections };
}

/** The sources of the images in the nodes under an H1, in order. */
function introImages(nodes: MarkdownNode[], source: string): string[] {
  const images: string[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === "image" || node.type === "imageReference") {
      const image = sourceFor(node, source);
      if (image) images.push(image);
    } else if (node.type === "paragraph") node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return images;
}

const LEAD = "<!-- _class: lead -->";

/** A `lead` slide with a title and the images under the H1 of the page. */
function titleSlide(
  title: string,
  introNodes: MarkdownNode[],
  source: string,
): string {
  const images = introImages(introNodes, source);
  // The directive comes after the heading: before it, a `headingDivider` would
  // start a slide of its own for the comment, and that slide would be empty.
  return `# ${title}${
    images.length ? `\n\n${images.join("\n\n")}` : ""
  }\n\n${LEAD}`;
}

/**
 * The slides of a nested page: first a divider slide with the title of the
 * page, then the slides of its sections, built by the same rules as for any
 * lesson.
 */
function nestedSet(id: string, source: string, number: string): NestedSet {
  const page = parseLesson(source);
  const title = nodeText(page.title).trim();
  return {
    id,
    number,
    title,
    slides: [
      // A divider is a title slide of the set, with the images under its H1.
      titleSlide(
        `${number ? `${number} ` : ""}${title}`,
        page.introNodes,
        source,
      ),
      ...page.sections.flatMap((each) =>
        each.blocks.length > 0 ? renderSection(each.heading, each.blocks) : []
      ),
    ],
  };
}

/**
 * The number at the start of a section heading: `2` for `2. The levels` and
 * `2.1` for `2.1 Part`. It is empty when the heading has no number.
 */
function sectionNumber(heading: string): string {
  return heading.match(/^(\d+(?:\.\d+)*)[.)]?\s/)?.[1] ?? "";
}

/** The number of slides in a piece of Markdown: its `---` separators outside code, plus one. */
function slideCount(markdown: string): number {
  let count = 1;
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const opening = line.match(/^\s*(`{3,}|~{3,})/);
    if (opening) {
      if (!fence) fence = opening[1][0];
      else if (opening[1][0] === fence) fence = undefined;
    } else if (!fence && /^---\s*$/.test(line)) count++;
  }
  return count;
}

/** The anchor that a heading gets in a rendered page: lower case, no punctuation, hyphens for spaces. */
function headingSlug(text: string): string {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(
    /\s/g,
    "-",
  );
}

/**
 * Points the links inside a generated deck at slides of the same deck (spec
 * *Nested lesson pages*, rule N12): a link to a nested page goes to its divider
 * slide, `#anchor` to the slide of the heading with that anchor, and `page.md#anchor`
 * to that heading when it is in the page. The target is `#<number>`, which Marp's HTML
 * and the pptx follow. Other links stay as they are.
 */
function linkWithinDeck(
  slides: string[],
  dividers: Map<string, number>,
  nestedPage: LessonSlidesOptions["nestedPage"],
): string[] {
  const numbers: number[] = [];
  let next = 1;
  for (const slide of slides) {
    numbers.push(next);
    next += slideCount(slide);
  }
  const anchors = new Map<string, number>();
  slides.forEach((slide, index) => {
    const heading = slide.match(/^# (.+)$/m)?.[1];
    if (!heading) return;
    const slug = headingSlug(heading.replace(/\s*\(\d+\/\d+\)$/, ""));
    if (slug && !anchors.has(slug)) anchors.set(slug, numbers[index]);
  });
  if (!anchors.size && !dividers.size) return slides;
  const pages = new Map<string, string | undefined>();
  const pageOf = (path: string): string | undefined => {
    if (!pages.has(path)) pages.set(path, nestedPage?.(path)?.id);
    return pages.get(path);
  };
  return slides.map((slide) =>
    slide.replace(
      /(?<!!)(\[[^\]]*\]\()([^)\s]+)(\))/g,
      (whole, open, url, close) => {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return whole;
        const [path, fragment] = url.split("#");
        let target: number | undefined;
        if (path) {
          const id = pageOf(path);
          const divider = id === undefined ? undefined : dividers.get(id);
          if (divider === undefined) return whole;
          target = (fragment && anchors.get(fragment)) || numbers[divider];
        } else if (fragment) {
          target = anchors.get(fragment);
        }
        return target === undefined ? whole : `${open}#${target}${close}`;
      },
    )
  );
}

/** Whether a section heading starts the appendices: `Bijlagen`, `Bijlage A: ...`, `Appendices`, `Appendix A ...`. */
export function isAppendixHeading(heading: string): boolean {
  return /^(?:bijlagen|appendices|(?:bijlage|appendix)\b.*)$/i.test(
    heading.trim().replace(/^\d+(?:\.\d+)*[.)]?\s+/, ""),
  );
}

const APPENDIX_STYLE =
  "<style>section.appendix footer{left:auto;right:0;padding:inherit}</style>";

const APPENDIX_WORDS = {
  nl: { one: "Bijlage", many: "Bijlagen", range: "t/m", letter: "B" },
  en: { one: "Appendix", many: "Appendices", range: "to", letter: "A" },
};

/** The slides of a piece of Markdown, split at its `---` lines outside code. */
function splitSlides(markdown: string): string[] {
  const slides: string[][] = [[]];
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const opening = line.match(/^\s*(`{3,}|~{3,})/);
    if (opening) {
      if (!fence) fence = opening[1][0];
      else if (opening[1][0] === fence) fence = undefined;
    }
    if (!fence && !opening && /^---\s*$/.test(line)) slides.push([]);
    else slides[slides.length - 1].push(line);
  }
  return slides.map((lines) => lines.join("\n").replace(/^\n+|\n+$/g, ""));
}

/**
 * Marks the slides from `from` on as appendix slides: Marp leaves them out of
 * the count (`_paginate: skip`, so the others are `3/12`, not `3/139`) and shows
 * `Bijlage 5/127` in the footer instead. The class `appendix` tells the pptx.
 */
function markAppendix(
  slides: string[],
  from: number,
  words: { one: string },
): string[] {
  const parts = slides.slice(from).flatMap(splitSlides);
  const total = parts.length;
  const marked = parts.map((part, index) => {
    // The directives come at the end of the slide: before the heading, a
    // `headingDivider` would start a slide of its own for them (an empty one).
    const lead = part.includes(LEAD);
    const body = lead
      ? part.replace(LEAD, "<!-- _class: lead appendix -->")
      : `${part}\n\n<!-- _class: appendix -->`;
    return `${body}\n<!-- _paginate: skip -->\n<!-- _footer: "${words.one} ${
      index + 1
    }/${total}" -->`;
  });
  return [...slides.slice(0, from), ...marked];
}

/**
 * Collects the pages that the `nest` setting selects, each only once, and
 * numbers them under the section that links to them.
 */
function nestedCollector(
  nestedPage: LessonSlidesOptions["nestedPage"],
): (nodes: MarkdownNode[], heading: string) => NestedSet[] {
  const seenPages = new Set<string>();
  return (nodes, heading) => {
    const found: NestedSet[] = [];
    const base = sectionNumber(heading);
    for (const url of nodes.flatMap(linkUrls)) {
      const page = nestedPage?.(url);
      if (!page || seenPages.has(page.id)) continue;
      seenPages.add(page.id);
      found.push(
        nestedSet(
          page.id,
          page.source,
          base ? `${base}.${found.length + 1}` : "",
        ),
      );
    }
    return found;
  };
}

/**
 * The slides of the pages that a lesson links to and that `nest` selects, as
 * appendix slides to put after the slides of a manual deck (spec rule N13), in
 * the order of the links. Empty when the lesson links to no such page.
 */
export function generateNestedAppendix(
  source: string,
  options: Pick<LessonSlidesOptions, "nestedPage" | "locale">,
): string {
  const { sections } = parseLesson(source);
  const nestedIn = nestedCollector(options.nestedPage);
  const slides = sections.flatMap((each) =>
    nestedIn(each.nodes, each.heading).flatMap((set) => set.slides)
  );
  if (!slides.length) return "";
  const words = APPENDIX_WORDS[options.locale ?? "nl"];
  // The style comes last: before the first heading it would be a slide of its own
  // under a `headingDivider`.
  return `${
    markAppendix(slides, 0, words).join("\n\n---\n\n")
  }\n\n${APPENDIX_STYLE}`;
}

/**
 * Builds a Marp slide deck from a lesson: a title slide, an optional contents
 * slide, and slides for the lists, tables, images, code and diagrams of each
 * section. Running text is left out.
 */
export function generateLessonSlides(
  source: string,
  options: LessonSlidesOptions = {},
): string {
  const { tree, title, introNodes, sections } = parseLesson(source);
  // Collect the slide decks that the lesson links to, each only once, at its
  // first link.
  const seen = new Set<string>();
  const decksIn = (nodes: MarkdownNode[]): LinkedDeckSlides[] => {
    const found: LinkedDeckSlides[] = [];
    for (const url of nodes.flatMap(linkUrls)) {
      const deck = options.linkedDeck?.(url);
      if (!deck || seen.has(deck.id)) continue;
      seen.add(deck.id);
      found.push(deck);
    }
    return found;
  };
  const nestedIn = nestedCollector(options.nestedPage);
  const introDecks = decksIn(introNodes);
  for (const each of sections) {
    each.decks = decksIn(each.nodes);
    each.nested = nestedIn(each.nodes, each.heading);
  }
  // A section that has nothing to show on a slide gets no slide, and its
  // heading is left out too (spec rule G4).
  const listed = sections.filter((each) => each.blocks.length > 0);
  // The appendices run from the first appendix section to the end of the deck.
  const appendixStart = sections.findIndex((each) =>
    isAppendixHeading(each.heading)
  );
  const words = APPENDIX_WORDS[options.locale ?? "nl"];
  const appendixTotal = appendixStart < 0 ? 0 : sections.slice(appendixStart)
    .reduce(
      (sum, each) =>
        sum +
        (each.blocks.length > 0
          ? renderSection(each.heading, each.blocks).length
          : 0) +
        each.decks.reduce((n, deck) => n + slideCount(deck.markdown), 0) +
        each.nested.reduce((n, set) => n + set.slides.length, 0),
      0,
    );
  // The title slide is a `lead` slide: centred, with the course logo (or the BSO logo).
  const slides = [titleSlide(nodeText(title).trim(), introNodes, source)];
  if (options.contentsTitle && listed.length >= 2) {
    // `1. Intro` after `- ` would start a nested ordered list (roman numbers)
    const entry = (text: string, indent = "") =>
      `${indent}- ${text.replace(/^(\d+(?:\.\d+)*)([.)])(?=\s)/, "$1\\$2")}`;
    slides.push(
      `# ${options.contentsTitle}\n\n${
        [
          ...introDecks.map((deck) => entry(deck.title)),
          ...sections.flatMap((each, index) =>
            appendixStart >= 0 && index >= appendixStart ? [] : [
              ...(each.blocks.length > 0 ? [entry(each.heading)] : []),
              ...each.decks.map((deck) => entry(deck.title)),
              ...each.nested.map((set) =>
                entry(`${set.number ? `${set.number} ` : ""}${set.title}`, "  ")
              ),
            ]
          ),
          ...(appendixTotal > 0
            ? [
              entry(
                `${words.many} (${words.letter}1 ${words.range} ${words.letter}${appendixTotal})`,
              ),
            ]
            : []),
        ].join("\n")
      }`,
    );
  }
  slides.push(...introDecks.map((deck) => deck.markdown));
  // The index in `slides` of the divider slide of each nested page, for links.
  const dividers = new Map<string, number>();
  let appendixFrom = -1;
  for (const [index, section] of sections.entries()) {
    const { heading, blocks, decks, nested } = section;
    if (index === appendixStart) appendixFrom = slides.length;
    slides.push(
      ...(blocks.length > 0 ? renderSection(heading, blocks) : []),
      ...decks.map((deck) => deck.markdown),
    );
    for (const set of nested) {
      dividers.set(set.id, slides.length);
      slides.push(...set.slides);
    }
  }
  const numbered = linkWithinDeck(slides, dividers, options.nestedPage);
  const linked = appendixFrom < 0
    ? numbered
    : markAppendix(numbered, appendixFrom, words);
  const definitions = tree.children.filter((node) => node.type === "definition")
    .map((node) => sourceFor(node, source)).filter(Boolean);
  const deck = linked.join("\n\n---\n\n");
  return [
    "---",
    "marp: true",
    "theme: default",
    "paginate: true",
    "---",
    "",
    ...(appendixFrom < 0 ? [] : [
      "<style>section.appendix footer{left:auto;right:0;padding:inherit}</style>",
      "",
    ]),
    deck,
    ...(definitions.length ? ["", definitions.join("\n\n")] : []),
    "",
  ].join("\n");
}

/**
 * A section of a lesson that gets no slide, because it has nothing to show on a
 * slide (spec *Generated slides: what a section gives*, rule G4).
 */
export interface SectionWithoutSlideContent {
  heading: string;
  /** The line of the heading in the source, counting from 1. */
  line: number;
  /** Whether the section links to a `.md` file, which may be a slide deck whose slides are inserted. */
  linksToMarkdown: boolean;
}

/**
 * The `##` sections that have no list, table, image, code or diagram, so the
 * generated slides leave them out. Sources are not reported.
 */
export function sectionsWithoutSlideContent(
  source: string,
): SectionWithoutSlideContent[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(
    source,
  ) as unknown as { children: MarkdownNode[] };
  const found: SectionWithoutSlideContent[] = [];
  let current: { node: MarkdownNode; nodes: MarkdownNode[] } | undefined;
  const finish = () => {
    if (!current) return;
    const heading = nodeText(current.node).trim();
    if (
      !isSourcesHeading(heading) &&
      sectionBlocks(current.nodes, source, isCoreConcepts(heading)).length === 0
    ) {
      found.push({
        heading,
        line: current.node.position?.start.line ?? 1,
        linksToMarkdown: current.nodes.flatMap(linkUrls).some((url) =>
          /\.md(?:#|$)/i.test(url)
        ),
      });
    }
  };
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      finish();
      current = { node, nodes: [] };
    } else if (current) {
      current.nodes.push(node);
    }
  }
  finish();
  return found;
}

/**
 * Removes the start of the titles of the slides that the regular expression `prefix` matches, so
 * `## Slide 3 - Standup` becomes `## Standup` (spec *Title prefix*, rules TP1-TP3). Only headings
 * outside code fences are changed, only at the start of the title, and a title that is only the
 * prefix is left as it is: an empty title would be a worse slide than a long one.
 */
export function stripTitlePrefix(markdown: string, prefix: string): string {
  const pattern = new RegExp(`^(#{1,6})[ \\t]+(?:${prefix})(?=\\S)`);
  let fence: string | undefined;
  return markdown.split("\n").map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = undefined;
      return line;
    }
    if (fence) return line;
    return line.replace(pattern, "$1 ");
  }).join("\n");
}
