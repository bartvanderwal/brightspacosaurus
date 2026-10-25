/**
 * Turns a parsed BSO slide deck into an editable PowerPoint file (`.pptx`): real
 * text boxes, lists, tables and images, with the speaker notes when asked.
 * Content is wrapped and paginated before numbering the resulting slides.
 *
 * @module
 */

import pptxgenModule from "pptxgenjs";
import JSZip from "jszip";
import { imageSize } from "image-size";
import { dirname, isAbsolute, resolve } from "@std/path";
import { slideNumbers } from "../slide-numbering.ts";
import type {
  PptxBlock,
  PptxDeck,
  PptxRun,
  PptxSlide,
} from "./deck-parser.ts";

/** Colours and fonts of the presentation; the defaults are neutral. */
export interface PptxTheme {
  fontFace: string;
  titleColor: string;
  textColor: string;
  accentColor: string;
  mutedColor: string;
}

/** What the renderer needs besides the slide deck. */
export interface PptxRenderOptions {
  /** Folder that relative image paths are resolved against. */
  baseDir: string;
  /** Keep the speaker notes in the file (`slides.notes`). */
  notes?: boolean;
  /** Logo file, shown big on the title slide and small elsewhere. */
  logo?: string;
  /** Text shown at the top of every slide; empty or missing shows none. */
  disclaimer?: string;
  theme?: Partial<PptxTheme>;
  /** Date in the file properties, so the same slide deck gives the same file. */
  date?: string;
}

// The package is CommonJS: Deno gives the class at runtime, the types describe
// the module with a `default` export.
type Presentation = InstanceType<typeof pptxgenModule.default>;
const PptxGenJS = pptxgenModule as unknown as typeof pptxgenModule.default;

const DEFAULT_THEME: PptxTheme = {
  fontFace: "Calibri",
  titleColor: "1F2937",
  textColor: "1F2937",
  accentColor: "0B6BCB",
  mutedColor: "6B7280",
};

const WIDTH = 10;
const HEIGHT = 5.625;
const MARGIN = 0.6;
const BODY_TOP = 1.45;
const BODY_BOTTOM = 5.2;
const SIZES = [22, 20, 18, 16, 14, 12];

interface Loaded {
  data: string;
  width: number;
  height: number;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** The size of an SVG from its `viewBox`, else its `width` and `height`; 800 by 600 when it says neither. */
function svgSize(svg: string): { width: number; height: number } {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const box = tag.match(
    /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
  );
  if (box && Number(box[1]) > 0 && Number(box[2]) > 0) {
    return { width: Number(box[1]), height: Number(box[2]) };
  }
  const width = Number(tag.match(/\swidth\s*=\s*["']([\d.]+)/i)?.[1]);
  const height = Number(tag.match(/\sheight\s*=\s*["']([\d.]+)/i)?.[1]);
  return width > 0 && height > 0
    ? { width, height }
    : { width: 800, height: 600 };
}

async function loadImage(
  src: string,
  baseDir: string,
  slide: number,
): Promise<Loaded> {
  // An image that BSO embedded itself (a generated deck): `data:image/...;base64,...`.
  const dataUrl = src.match(
    /^data:(image\/(?:png|jpeg|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (dataUrl) {
    const bytes = Uint8Array.from(atob(dataUrl[2]), (c) => c.charCodeAt(0));
    const size = dataUrl[1] === "image/svg+xml"
      ? svgSize(new TextDecoder().decode(bytes))
      : imageSize(bytes);
    return {
      data: `${dataUrl[1]};base64,${dataUrl[2]}`,
      width: size.width ?? 800,
      height: size.height ?? 600,
    };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(src)) {
    throw new Error(
      `Slide ${slide}: only local images can go into a .pptx, not '${src.slice(0, 80)}'.`,
    );
  }
  const file = isAbsolute(src)
    ? src
    : resolve(baseDir, decodeURIComponent(src));
  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(file);
  } catch {
    throw new Error(`Slide ${slide}: image not found: ${file}`);
  }
  const extension = file.split(".").pop()?.toLowerCase() ?? "png";
  const mime = MIME[extension];
  if (!mime) {
    throw new Error(
      `Slide ${slide}: unsupported image type '.${extension}': ${file}`,
    );
  }
  const size = extension === "svg"
    ? svgSize(new TextDecoder().decode(bytes))
    : imageSize(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return {
    data: `${mime};base64,${btoa(binary)}`,
    width: size.width ?? 800,
    height: size.height ?? 600,
  };
}

function runOptions(run: PptxRun, theme: PptxTheme, size: number) {
  const href = externalHref(run.href);
  return {
    bold: run.bold,
    italic: run.italic,
    fontFace: run.code ? "Courier New" : theme.fontFace,
    fontSize: size,
    color: href ? theme.accentColor : theme.textColor,
    ...(href ? { hyperlink: { url: href } } : {}),
  };
}

function externalHref(href: string | undefined): string | undefined {
  if (!href || href.startsWith("#")) return undefined;
  if (
    (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^file:/i.test(href)) ||
    href.startsWith("//")
  ) {
    return href;
  }
  let path = href.split(/[?#]/, 1)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  return /\.md$/i.test(path) ? undefined : href;
}

/** Explicit lines leave room for wide glyphs and do not rely on Office auto-fit. */
function wrapRuns(runs: PptxRun[], size: number, width: number): PptxRun[][] {
  const capacity = Math.max(1, width * 72 / size);
  const lines: PptxRun[][] = [[]];
  let used = 0;
  const units = (char: string) => char === " " ? 0.6 : 1.1;
  for (const run of runs) {
    const tokens = run.text.replace(/\t/g, "    ").replace(/\r\n?/g, "\n")
      .match(/\n|[^\S\n]+|[^\s]+/gu) ?? [];
    for (const token of tokens) {
      const length = [...token].reduce((sum, char) => sum + units(char), 0);
      if (
        /^\S/u.test(token) && length <= capacity && used > 0 &&
        used + length > capacity
      ) {
        lines.push([]);
        used = 0;
      }
      for (const char of token) {
        if (char === "\n" || (used > 0 && used + units(char) > capacity)) {
          lines.push([]);
          used = 0;
        }
        if (char === "\n") continue;
        const line = lines[lines.length - 1];
        const last = line[line.length - 1];
        if (
          last && last.bold === run.bold && last.italic === run.italic &&
          last.code === run.code && last.href === run.href
        ) last.text += char;
        else line.push({ ...run, text: char });
        used += units(char);
      }
    }
  }
  return lines;
}

function joinLines(lines: PptxRun[][]): PptxRun[] {
  return lines.flatMap((line, index) => [
    ...(index ? [{ text: "\n" }] : []),
    ...line,
  ]);
}

interface Piece {
  block: PptxBlock;
  height: number;
  size: number;
  indent?: number;
  bullet?: boolean;
  ordinal?: number;
  rowHeights?: number[];
  image?: Loaded;
}

interface LayoutPage {
  slide: PptxSlide;
  pieces: Piece[];
  left: number;
  width: number;
  top: number;
}

function textBounds(slide: PptxSlide) {
  const background = slide.blocks.find((block) =>
    block.kind === "image" && block.background
  );
  let left = MARGIN;
  let right = WIDTH - MARGIN;
  if (background?.kind === "image" && background.background) {
    const { side, share } = background.background;
    if (side === "left") left = WIDTH * share + 0.3;
    if (side === "right") right = WIDTH * (1 - share) - 0.3;
  }
  if (right - left < 0.5) {
    throw new Error("Background image leaves less than 0.5 inch for slide text.");
  }
  return { left, width: right - left };
}

async function paginate(deck: PptxDeck, options: PptxRenderOptions) {
  const pages: LayoutPage[] = [];
  for (const [sourceIndex, slide] of deck.slides.entries()) {
    const bounds = textBounds(slide);
    let page: LayoutPage;
    let used = 0;
    const next = () => {
      const lead = pages.length === 0 && slide.lead;
      page = {
        slide: { ...slide, lead },
        pieces: [],
        ...bounds,
        top: lead ? 2.7 : BODY_TOP,
      };
      pages.push(page);
      used = 0;
    };
    next();
    const room = () => BODY_BOTTOM - page.top - used;
    const put = (piece: Piece) => {
      if (piece.height > room() + 0.000001) next();
      page.pieces.push(piece);
      used += piece.height;
    };
    const text = (
      block: Extract<PptxBlock, { kind: "paragraph" | "quote" | "code" }>,
      size: number,
      indent = 0,
      bullet = false,
      ordinal?: number,
    ) => {
      const code = block.kind === "code";
      while (
        bounds.width - indent - (code ? 0.24 : bullet ? size / 72 + 0.1 : 0) <
          size * 1.1 / 72
      ) size *= 0.8;
      const lines = wrapRuns(
        code ? [{ text: block.text, code: true }] : block.runs,
        size,
        bounds.width - indent - (code ? 0.24 : bullet ? size / 72 + 0.1 : 0),
      );
      const lineHeight = size * 1.5 / 72;
      const padding = code ? 0.24 : 0.08;
      let first = true;
      while (lines.length) {
        let count = Math.floor((room() - padding) / lineHeight);
        if (count < 1) {
          next();
          count = Math.floor((room() - padding) / lineHeight);
        }
        const part = joinLines(lines.splice(0, count));
        put({
          block: code
            ? { ...block, text: part.map((run) => run.text).join("") }
            : { ...block, runs: part },
          size,
          height: Math.ceil((part.filter((run) => run.text === "\n").length + 1) *
            lineHeight * 1000000) / 1000000 + padding,
          indent,
          bullet: first && bullet,
          ordinal,
        });
        first = false;
      }
    };
    const list = (
      block: Extract<PptxBlock, { kind: "list" }>,
      depth = 0,
    ) => {
      block.items.forEach((item, index) => {
        const indent = Math.min(0.3 * (depth + 1), bounds.width / 2);
        text(
          { kind: "paragraph", runs: item.runs },
          18,
          indent,
          true,
          block.ordered ? index + 1 : undefined,
        );
        list({ ...block, items: item.children }, depth + 1);
      });
    };
    for (const block of slide.blocks) {
      if (block.kind === "image" && block.background) continue;
      if (block.kind === "paragraph" || block.kind === "quote") {
        const size = SIZES.find((size) =>
          wrapRuns(block.runs, size, bounds.width).length * size * 1.5 / 72 +
              0.08 <= room()
        ) ?? 18;
        text(block, size);
      } else if (block.kind === "code") text(block, 13);
      else if (block.kind === "list") list(block);
      else if (block.kind === "image") {
        const image = await loadImage(block.src, options.baseDir, sourceIndex + 1);
        if (room() < 1.2) next();
        const height = Math.min(
          room() - 0.08,
          image.height * bounds.width / image.width,
        );
        put({ block, size: 0, height: height + 0.08, image });
      } else if (block.kind === "table" && block.rows.length) {
        const columns = Math.max(...block.rows.map((row) => row.length));
        let size = Math.min(14, bounds.width * 72 / (columns * 4));
        const padding = Math.min(0.08, bounds.width / columns / 8);
        const cellWidth = bounds.width / columns - padding * 2;
        const available = BODY_BOTTOM - BODY_TOP;
        let header: PptxRun[][];
        let headerHeight: number;
        do {
          header = Array.from({ length: columns }, (_, index) =>
            joinLines(wrapRuns(block.rows[0][index] ?? [], size, cellWidth))
          );
          headerHeight = Math.max(...header.map((cell) =>
            cell.map((run) => run.text).join("").split("\n").length
          )) * size * 1.5 / 72 + padding * 2;
          if (headerHeight <= available / 2) break;
          size *= 0.8;
        } while (true);
        const rowHeight = (count: number) =>
          count * size * 1.5 / 72 + padding * 2;
        let rows: PptxRun[][][] = [header];
        let heights = [headerHeight];
        const flush = () => {
          put({
            block: { kind: "table", rows },
            size,
            height: heights.reduce((sum, height) => sum + height, 0),
            rowHeights: heights,
          });
          rows = [header];
          heights = [headerHeight];
        };
        if (headerHeight + rowHeight(1) > room()) next();
        for (const row of block.rows.slice(1)) {
          const cells = Array.from({ length: columns }, (_, index) =>
            wrapRuns(row[index] ?? [], size, cellWidth)
          );
          while (cells.some((cell) => cell.length)) {
            const occupied = heights.reduce((sum, height) => sum + height, 0);
            const count = Math.floor((room() - occupied - padding * 2) /
              (size * 1.5 / 72));
            if (count < 1) {
              if (rows.length > 1) flush();
              next();
              continue;
            }
            const taken = Math.min(count, Math.max(...cells.map((cell) => cell.length)));
            rows.push(cells.map((cell) => joinLines(cell.splice(0, taken))));
            heights.push(rowHeight(taken));
          }
        }
        if (rows.length > 1 || block.rows.length === 1) flush();
      }
    }
  }
  return pages;
}

async function addSlide(
  pres: Presentation,
  layout: LayoutPage,
  number: number,
  label: string,
  options: PptxRenderOptions,
  theme: PptxTheme,
  logo: Loaded | undefined,
) {
  const { slide, left, width, top } = layout;
  const page = pres.addSlide();
  const background = slide.blocks.find((block) =>
    block.kind === "image" && block.background
  );

  if (background && background.kind === "image" && background.background) {
    const { side, share } = background.background;
    const picture = await loadImage(background.src, options.baseDir, number);
    const w = WIDTH * share;
    const x = side === "left" ? 0 : side === "right" ? WIDTH - w : 0;
    const scale = Math.min(w / picture.width, HEIGHT / picture.height);
    const iw = picture.width * scale;
    const ih = picture.height * scale;
    const fit = { x: x + (w - iw) / 2, y: (HEIGHT - ih) / 2, w: iw, h: ih };
    page.addImage({
      data: picture.data,
      ...fit,
      altText: background.alt.replace(
        /(?:^|\s)(?:bg|fit|contain|left|right)(?::\d+(?:\.\d+)?%)?(?=\s|$)/g,
        " ",
      ).trim() || "Slide image",
    });
  }

  const lead = slide.lead && number === 1;
  if (options.disclaimer) {
    page.addText(options.disclaimer, {
      x: left,
      y: 0.08,
      w: width,
      h: 0.3,
      fontSize: 10,
      color: theme.mutedColor,
      fontFace: theme.fontFace,
      margin: 0,
      fit: "shrink",
    });
  }
  if (slide.title) {
    const height = lead ? 1.2 : 0.9;
    let size = lead ? 36 : 28;
    let lines = wrapRuns([{ text: slide.title }], size, width);
    while (lines.length * size * 1.5 / 72 > height) {
      size *= 0.9;
      lines = wrapRuns([{ text: slide.title }], size, width);
    }
    page.addText(joinLines(lines).map((run) => ({ text: run.text })), {
      x: left,
      y: lead ? 1.3 : 0.4,
      w: width,
      h: height,
      fontSize: size,
      bold: true,
      color: theme.titleColor,
      fontFace: theme.fontFace,
      valign: "middle",
      margin: 0,
      fit: "shrink",
    });
  }

  let y = top;
  for (const piece of layout.pieces) {
    const { block, size, height } = piece;
    if (block.kind === "paragraph" || block.kind === "quote") {
      page.addText(
        block.runs.map((run) => ({
          text: run.text === "\n" ? "" : run.text,
          options: {
            ...runOptions(run, theme, size),
            italic: block.kind === "quote" || run.italic,
            softBreakBefore: run.text === "\n",
          },
        })),
        {
          x: left + (piece.indent ?? 0),
          y,
          w: width - (piece.indent ?? 0),
          h: height,
          valign: "top",
          margin: 0,
          fontSize: size,
          fontFace: theme.fontFace,
          lineSpacingMultiple: 1,
          paraSpaceAfter: 0,
          ...(piece.bullet
            ? {
              bullet: piece.ordinal
                ? { type: "number" as const, numberStartAt: piece.ordinal }
                : { indent: size },
              hanging: Math.max(2, size / 4),
            }
            : {}),
        },
      );
    } else if (block.kind === "table") {
      page.addTable(
        block.rows.map((row, rowIndex) =>
          row.map((cell) => ({
            text: cell.map((run) => ({
              text: run.text === "\n" ? "" : run.text,
              options: {
                ...runOptions(run, theme, size),
                bold: run.bold || rowIndex === 0,
                softBreakBefore: run.text === "\n",
              },
            })),
          }))
        ),
        {
          x: left,
          y,
          w: width,
          colW: Array(block.rows[0].length).fill(width / block.rows[0].length),
          rowH: piece.rowHeights,
          fontSize: size,
          fontFace: theme.fontFace,
          margin: Math.min(5.76, width / block.rows[0].length * 72 / 8),
          autoPage: false,
          valign: "top",
          paraSpaceAfter: 0,
          border: { type: "solid", color: "D0D5DB", pt: 1 },
        },
      );
    } else if (block.kind === "code") {
      page.addText(block.text, {
        x: left,
        y,
        w: width,
        h: height,
        fontFace: "Courier New",
        fontSize: size,
        color: "D4D4D4",
        fill: { color: "1E1E1E" },
        valign: "top",
        margin: 8,
        lineSpacingMultiple: 1,
        paraSpaceAfter: 0,
      });
    } else if (block.kind === "image") {
      const picture = piece.image!;
      const scale = Math.min(
        width / picture.width,
        (height - 0.08) / picture.height,
      );
      const w = picture.width * scale;
      const h = picture.height * scale;
      page.addImage({
        data: picture.data,
        x: left + (width - w) / 2,
        y,
        w,
        h,
        altText: block.alt || "Slide image",
      });
    }
    y += height;
  }

  if (logo) {
    const scale = Math.min(
      (lead ? 1.5 : 0.5) / logo.width,
      (lead ? 0.9 : 0.3) / logo.height,
    );
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.addImage({
      data: logo.data,
      x: lead ? left : WIDTH - 0.4 - w,
      y: lead ? 0.35 : HEIGHT - 0.2 - h,
      w,
      h,
      altText: "Logo",
    });
  }
  page.addText(label, {
    x: left,
    y: HEIGHT - 0.4,
    w: 0.8,
    h: 0.3,
    fontSize: 10,
    color: theme.mutedColor,
    align: "left",
    fontFace: theme.fontFace,
  });
  if (options.notes && slide.notes.length) {
    page.addNotes(slide.notes.join("\n\n"));
  }
}

/** Renders a parsed slide deck as the bytes of a `.pptx` file. */
export async function renderDeck(
  deck: PptxDeck,
  options: PptxRenderOptions,
): Promise<Uint8Array> {
  const theme: PptxTheme = { ...DEFAULT_THEME, ...options.theme };
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  if (deck.title) pres.title = deck.title;
  const logo = options.logo
    ? await loadImage(options.logo, dirname(resolve(options.logo)), 0)
    : undefined;
  const pages = await paginate(deck, options);
  const numbers = slideNumbers(pages.map((page) => page.slide.title));
  for (const [index, slide] of pages.entries()) {
    await addSlide(
      pres,
      slide,
      index + 1,
      numbers[index].label,
      options,
      theme,
      logo,
    );
  }
  const bytes = await pres.write({ outputType: "uint8array" }) as Uint8Array;
  return await stabilize(bytes, options.date ?? "2000-01-01T00:00:00Z");
}

/**
 * pptxgenjs writes an `<a:pPr>` after every further part of a paragraph (for
 * example a link or a word in code inside a list item). OOXML allows one, and
 * only as the first child of the paragraph; PowerPoint ignores the rest of the
 * paragraph after a misplaced one, so a hyperlink there stops working. Every
 * `<a:pPr>` that is not the first child is dropped.
 */
export function singleParagraphProperties(xml: string): string {
  const properties = /<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g;
  return xml.replace(/(<a:p>)([\s\S]*?)(<\/a:p>)/g, (_, open, body, close) => {
    const first = /^<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/.exec(body)?.[0] ??
      "";
    return open + first + body.slice(first.length).replace(properties, "") +
      close;
  });
}

/** Same slide deck, same bytes: fixed file dates and a fixed order of the entries. */
async function stabilize(bytes: Uint8Array, date: string): Promise<Uint8Array> {
  const source = await JSZip.loadAsync(bytes);
  const fixed = new Date(date);
  const target = new JSZip();
  for (const name of Object.keys(source.files).sort()) {
    const entry = source.files[name];
    if (entry.dir) {
      target.file(name, "", { dir: true, date: fixed });
      continue;
    }
    let content: Uint8Array | string = await entry.async("uint8array");
    if (/^ppt\/(?:slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(name)) {
      content = singleParagraphProperties(await entry.async("string"));
    } else if (name === "docProps/core.xml") {
      content = (await entry.async("string")).replace(
        /(<dcterms:(?:created|modified)[^>]*>)[^<]*(<\/dcterms:)/g,
        `$1${date}$2`,
      );
    }
    target.file(name, content, { date: fixed, createFolders: false });
  }
  return await target.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
