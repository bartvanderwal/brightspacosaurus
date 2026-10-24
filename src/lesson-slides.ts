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

function tableBlocks(node: MarkdownNode, source: string): SlideBlock[] {
  const value = sourceFor(node, source);
  const lines = value.split("\n");
  if (lines.length <= MAX_SLIDE_LINES) {
    return value ? [{ markdown: value }] : [];
  }
  const blocks: SlideBlock[] = [];
  const header = lines.slice(0, 2);
  const rows = lines.slice(2);
  const rowsPerSlide = MAX_SLIDE_LINES - header.length;
  for (let index = 0; index < rows.length; index += rowsPerSlide) {
    blocks.push({
      markdown: [...header, ...rows.slice(index, index + rowsPerSlide)].join(
        "\n",
      ),
      separate: true,
    });
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
  const slides: string[] = [];
  let body: string[] = [];
  const flush = () => {
    if (body.length) slides.push(`# ${heading}\n\n${body.join("\n\n")}`);
    body = [];
  };
  for (const block of blocks) {
    if (block.separate) {
      flush();
      slides.push(`# ${heading}\n\n${block.markdown}`);
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
  if (body.length || !slides.length) flush();
  if (!slides.length) slides.push(`# ${heading}`);
  return slides;
}

/** Options for {@link generateLessonSlides}. */
export interface LessonSlidesOptions {
  /**
   * Title of a contents slide, listing the lesson's sections right after the
   * title slide. Omitted: no contents slide. Left out for a lesson with fewer
   * than two sections, where it would list nothing useful.
   */
  contentsTitle?: string;
  /**
   * Resolves the target of a link in the lesson to a linked deck (#144), or
   * undefined for an ordinary link. The slides of the deck are inserted after
   * the last slide of the section that contains the link, and its title is an
   * entry in the contents slide. A deck that is linked more than once is
   * inserted at the first link only (`id` identifies a deck).
   */
  linkedDeck?: (url: string) => LinkedDeckSlides | undefined;
}

/** A deck that a lesson links to, as the generator needs it. */
export interface LinkedDeckSlides {
  /** Identifies the deck, so it is inserted once. */
  id: string;
  /** Entry in the contents slide. */
  title: string;
  /** The deck's slides as Markdown, without front matter. */
  markdown: string;
}

function linkUrls(node: MarkdownNode): string[] {
  const own = node.type === "link" && node.url ? [node.url] : [];
  return [...own, ...(node.children ?? []).flatMap(linkUrls)];
}

/** Derive a preview-only Marp deck from the lesson's H1, H2s, lists, images and diagrams. */
export function generateLessonSlides(
  source: string,
  options: LessonSlidesOptions = {},
): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(
    source,
  ) as unknown as {
    children: MarkdownNode[];
  };
  const title = tree.children.find((node) =>
    node.type === "heading" && node.depth === 1
  );
  if (!title) {
    throw new Error("Generated lesson slides require an H1 lesson title.");
  }
  interface Section {
    heading: string;
    nodes: MarkdownNode[];
    decks: LinkedDeckSlides[];
    blocks: SlideBlock[];
  }
  const sections: Section[] = [];
  const introNodes: MarkdownNode[] = [];
  let section: Section | undefined;
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      section = {
        heading: nodeText(node).trim(),
        nodes: [],
        decks: [],
        blocks: [],
      };
      sections.push(section);
    } else if (section) {
      section.nodes.push(node);
    } else if (node !== title) {
      introNodes.push(node);
    }
  }
  // Decks linked in the lesson, each once, at the first link (#144).
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
  const introDecks = decksIn(introNodes);
  for (const each of sections) {
    each.decks = decksIn(each.nodes);
    each.blocks = sectionBlocks(
      each.nodes,
      source,
      isCoreConcepts(each.heading),
    );
  }
  // G4: a section without anything for a slide is left out, with its heading.
  const listed = sections.filter((each) => each.blocks.length > 0);
  // The title slide is a `lead` slide: centred, with the course logo (or the BSO logo).
  const slides = [`<!-- _class: lead -->\n# ${nodeText(title).trim()}`];
  if (options.contentsTitle && listed.length >= 2) {
    // `1. Intro` after `- ` would start a nested ordered list (roman numbers)
    const entry = (text: string) =>
      `- ${text.replace(/^(\d+(?:\.\d+)*)([.)])(?=\s)/, "$1\\$2")}`;
    slides.push(
      `# ${options.contentsTitle}\n\n${
        [
          ...introDecks.map((deck) => entry(deck.title)),
          ...sections.flatMap((each) => [
            ...(each.blocks.length > 0 ? [entry(each.heading)] : []),
            ...each.decks.map((deck) => entry(deck.title)),
          ]),
        ].join("\n")
      }`,
    );
  }
  slides.push(...introDecks.map((deck) => deck.markdown));
  for (const { heading, blocks, decks } of sections) {
    slides.push(
      ...(blocks.length > 0 ? renderSection(heading, blocks) : []),
      ...decks.map((deck) => deck.markdown),
    );
  }
  const definitions = tree.children.filter((node) => node.type === "definition")
    .map((node) => sourceFor(node, source)).filter(Boolean);
  const deck = slides.join("\n\n---\n\n");
  return [
    "---",
    "marp: true",
    "theme: default",
    "paginate: true",
    "---",
    "",
    deck,
    ...(definitions.length ? ["", definitions.join("\n\n")] : []),
    "",
  ].join("\n");
}

/** A `##` section of a lesson that gives no slide (guidebook 7.8, rule G4). */
export interface SectionWithoutSlideContent {
  heading: string;
  /** One-based line of the heading in the source. */
  line: number;
  /** The section links to a `.md` file, which may be a deck that is inserted. */
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
