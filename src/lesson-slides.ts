import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

interface MarkdownNode {
  type: string;
  depth?: number;
  lang?: string;
  ordered?: boolean;
  value?: string;
  children?: MarkdownNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
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
  const sections: { heading: string; nodes: MarkdownNode[] }[] = [];
  let section: { heading: string; nodes: MarkdownNode[] } | undefined;
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      section = { heading: nodeText(node).trim(), nodes: [] };
      sections.push(section);
    } else if (section) {
      section.nodes.push(node);
    }
  }
  // The title slide is a `lead` slide: centred, with the course logo (or the BSO logo).
  const slides = [`<!-- _class: lead -->\n# ${nodeText(title).trim()}`];
  if (options.contentsTitle && sections.length >= 2) {
    slides.push(
      `# ${options.contentsTitle}\n\n${
        sections.map(({ heading }) =>
          // `1. Intro` after `- ` would start a nested ordered list (roman numbers)
          `- ${heading.replace(/^(\d+(?:\.\d+)*)([.)])(?=\s)/, "$1\\$2")}`
        ).join("\n")
      }`,
    );
  }
  for (const { heading, nodes } of sections) {
    slides.push(
      ...renderSection(
        heading,
        sectionBlocks(nodes, source, isCoreConcepts(heading)),
      ),
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
