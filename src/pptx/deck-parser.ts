/**
 * Reads a BSO slide deck (Marp Markdown: slides separated by `---`) into a
 * small model that the PowerPoint renderer turns into an editable `.pptx`.
 * Only the BSO deck format is supported; HTML comments become speaker notes
 * and Marp directive comments (`<!-- _class: lead -->`) are not notes.
 *
 * @module
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

/** A piece of inline text with its emphasis. */
export interface PptxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

/** One list item: its text and the nested items below it. */
export interface PptxListItem {
  runs: PptxRun[];
  children: PptxListItem[];
}

/** Where a Marp background image (`![bg right:40%](...)`) goes. */
export interface PptxBackground {
  side: "left" | "right" | "full";
  /** Share of the slide width, 0 to 1. */
  share: number;
  /** `fit`/`contain` shows the whole image; otherwise it covers the area. */
  contain: boolean;
}

/** A block on a slide. */
export type PptxBlock =
  | { kind: "paragraph"; runs: PptxRun[] }
  | { kind: "list"; ordered: boolean; items: PptxListItem[] }
  | { kind: "table"; rows: PptxRun[][][] }
  | { kind: "code"; lang: string | null; text: string }
  | { kind: "quote"; runs: PptxRun[] }
  | { kind: "image"; src: string; alt: string; background?: PptxBackground };

/** One slide. */
export interface PptxSlide {
  title: string | null;
  blocks: PptxBlock[];
  notes: string[];
  /** The slide is a title slide (the first one, or `<!-- _class: lead -->`). */
  lead: boolean;
}

/** A parsed deck. */
export interface PptxDeck {
  title: string | null;
  slides: PptxSlide[];
}

interface MdNode {
  type: string;
  depth?: number;
  ordered?: boolean;
  value?: string;
  lang?: string | null;
  url?: string;
  alt?: string | null;
  children?: MdNode[];
}

const DIRECTIVE =
  /^\s*_?(?:class|paginate|header|footer|backgroundColor|backgroundImage|color|style|theme|size|marp|slides|title)\s*:/;
const COMMENT = /^<!--([\s\S]*?)-->$/;

/** Splits a deck into front matter and slide sources, ignoring `---` in code fences. */
function splitDeck(markdown: string): { front: string; slides: string[] } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let front = "";
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) =>
      index > 0 && line.trim() === "---"
    );
    if (end > 0) {
      front = lines.slice(1, end).join("\n");
      start = end + 1;
    }
  }
  const slides: string[][] = [[]];
  let fence: string | null = null;
  for (const line of lines.slice(start)) {
    const opening = line.match(/^\s*(`{3,}|~{3,})/);
    if (opening) {
      if (fence === null) fence = opening[1];
      else if (
        opening[1][0] === fence[0] && opening[1].length >= fence.length
      ) fence = null;
    }
    if (fence === null && /^---\s*$/.test(line)) slides.push([]);
    else slides[slides.length - 1].push(line);
  }
  return { front, slides: slides.map((slide) => slide.join("\n")) };
}

function inline(nodes: MdNode[], style: Omit<PptxRun, "text"> = {}): PptxRun[] {
  const runs: PptxRun[] = [];
  for (const node of nodes) {
    if (node.type === "text") runs.push({ ...style, text: node.value ?? "" });
    else if (node.type === "inlineCode") {
      runs.push({ ...style, text: node.value ?? "", code: true });
    } else if (node.type === "break") runs.push({ ...style, text: "\n" });
    else if (node.type === "strong") {
      runs.push(...inline(node.children ?? [], { ...style, bold: true }));
    } else if (node.type === "emphasis") {
      runs.push(...inline(node.children ?? [], { ...style, italic: true }));
    } else if (node.type === "link") {
      runs.push(...inline(node.children ?? [], { ...style, href: node.url }));
    } else if (node.type === "delete") {
      runs.push(...inline(node.children ?? [], style));
    }
  }
  return runs;
}

function plain(runs: PptxRun[]): string {
  return runs.map((run) => run.text).join("");
}

function listItems(list: MdNode): PptxListItem[] {
  return (list.children ?? []).map((item) => {
    const runs: PptxRun[] = [];
    const children: PptxListItem[] = [];
    for (const child of item.children ?? []) {
      if (child.type === "paragraph") {
        if (runs.length) runs.push({ text: "\n" });
        runs.push(...inline(child.children ?? []));
      } else if (child.type === "list") children.push(...listItems(child));
    }
    return { runs, children };
  });
}

/** `bg right:40% fit` and friends, from the alt text of a Marp image. */
function background(alt: string): PptxBackground | undefined {
  const words = alt.split(/\s+/);
  if (!words.includes("bg")) return undefined;
  const side = /(?:^|\s)left(?::|\s|$)/.test(alt)
    ? "left"
    : /(?:^|\s)right(?::|\s|$)/.test(alt)
    ? "right"
    : "full";
  const split = alt.match(/(?:left|right):(\d+(?:\.\d+)?)%/);
  const share = side === "full" ? 1 : split ? Number(split[1]) / 100 : 0.5;
  return {
    side,
    share,
    contain: words.includes("fit") || words.includes("contain"),
  };
}

function parseSlide(source: string, first: boolean): PptxSlide {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(
    source,
  ) as MdNode;
  const slide: PptxSlide = { title: null, blocks: [], notes: [], lead: first };
  const note = (comment: string) => {
    const body = comment.match(COMMENT)?.[1];
    if (body === undefined) return false;
    if (DIRECTIVE.test(body)) {
      if (/^\s*_?class\s*:\s*.*\blead\b/.test(body)) slide.lead = true;
    } else if (body.trim()) slide.notes.push(body.trim());
    return true;
  };
  for (const node of tree.children ?? []) {
    if (
      node.type === "heading" && slide.title === null &&
      slide.blocks.length === 0 && (node.depth ?? 6) <= 2
    ) {
      slide.title = plain(inline(node.children ?? []));
    } else if (node.type === "html") note((node.value ?? "").trim());
    else if (node.type === "paragraph") {
      const children = node.children ?? [];
      const rest: MdNode[] = [];
      for (const child of children) {
        if (child.type === "image") {
          const alt = child.alt ?? "";
          slide.blocks.push({
            kind: "image",
            src: child.url ?? "",
            alt,
            background: background(alt),
          });
        } else if (child.type === "html" && note((child.value ?? "").trim())) {
          continue;
        } else rest.push(child);
      }
      const runs = inline(rest);
      if (plain(runs).trim()) slide.blocks.push({ kind: "paragraph", runs });
    } else if (node.type === "list") {
      slide.blocks.push({
        kind: "list",
        ordered: Boolean(node.ordered),
        items: listItems(node),
      });
    } else if (node.type === "table") {
      slide.blocks.push({
        kind: "table",
        rows: (node.children ?? []).map((row) =>
          (row.children ?? []).map((cell) => inline(cell.children ?? []))
        ),
      });
    } else if (node.type === "code") {
      slide.blocks.push({
        kind: "code",
        lang: node.lang ?? null,
        text: node.value ?? "",
      });
    } else if (node.type === "blockquote") {
      const runs = (node.children ?? []).flatMap((child) =>
        child.type === "paragraph" ? inline(child.children ?? []) : []
      );
      if (plain(runs).trim()) slide.blocks.push({ kind: "quote", runs });
    }
  }
  return slide;
}

/** Parses a BSO deck (Marp Markdown) into slides. */
export function parseDeck(markdown: string): PptxDeck {
  const { front, slides } = splitDeck(markdown);
  const title =
    front.match(/^title:\s*(.+?)\s*$/m)?.[1]?.replace(/^["']|["']$/g, "") ??
      null;
  const parsed = slides
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => source.trim() !== "")
    .map(({ source }, position) => parseSlide(source, position === 0));
  return { title, slides: parsed };
}
