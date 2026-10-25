/**
 * Turns a parsed BSO slide deck into an editable PowerPoint file (`.pptx`): real
 * text boxes, lists, tables and images, with the speaker notes when asked.
 * The layout is estimated, not rendered; look at the result in PowerPoint.
 *
 * @module
 */

import pptxgenModule from "pptxgenjs";
import JSZip from "jszip";
import { imageSize } from "image-size";
import { dirname, isAbsolute, resolve } from "@std/path";
import type {
  PptxBlock,
  PptxDeck,
  PptxListItem,
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
  return {
    bold: run.bold,
    italic: run.italic,
    fontFace: run.code ? "Courier New" : theme.fontFace,
    fontSize: size,
    color: run.href ? theme.accentColor : theme.textColor,
    ...(run.href ? { hyperlink: { url: run.href } } : {}),
  };
}

/** Rough height in inches of some text at a font size, in a box of a width. */
function textHeight(text: string, size: number, width: number): number {
  const perLine = Math.max(8, (width * 72) / (size * 0.5));
  const lines = text.split("\n").reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)),
    0,
  );
  return lines * ((size * 1.25) / 72);
}

function listText(items: PptxListItem[], depth = 0): string[] {
  return items.flatMap((
    item,
  ) => [
    item.runs.map((run) => run.text).join(""),
    ...listText(item.children, depth + 1),
  ]);
}

function blockHeight(block: PptxBlock, size: number, width: number): number {
  if (block.kind === "paragraph" || block.kind === "quote") {
    return textHeight(block.runs.map((run) => run.text).join(""), size, width) +
      0.12;
  }
  if (block.kind === "list") {
    return listText(block.items).reduce(
      (sum, line) => sum + textHeight(line, size, width - 0.4) + 0.08,
      0,
    ) + 0.1;
  }
  if (block.kind === "table") {
    return block.rows.length * ((14 * 1.6) / 72 + 0.1) + 0.1;
  }
  if (block.kind === "code") {
    return block.text.split("\n").length * ((13 * 1.3) / 72) + 0.3;
  }
  return 0;
}

function pickSize(
  blocks: PptxBlock[],
  width: number,
  available: number,
): number {
  for (const size of SIZES) {
    const used = blocks.reduce(
      (sum, block) => sum + blockHeight(block, size, width),
      0,
    );
    if (used <= available) return size;
  }
  return SIZES[SIZES.length - 1];
}

function flatten(
  items: PptxListItem[],
  ordered: boolean,
  size: number,
  theme: PptxTheme,
  level = 0,
) {
  const out: { text: string; options: Record<string, unknown> }[] = [];
  for (const item of items) {
    const runs = item.runs.length ? item.runs : [{ text: "" }];
    runs.forEach((run, index) => {
      out.push({
        text: run.text,
        options: {
          ...runOptions(run, theme, size),
          // The list settings sit on the first part of the item: a part with
          // them starts a new paragraph in pptxgenjs.
          ...(index === 0
            ? {
              bullet: ordered ? { type: "number" } : true,
              indentLevel: level,
            }
            : {}),
          breakLine: index === runs.length - 1,
        },
      });
    });
    out.push(...flatten(item.children, ordered, size, theme, level + 1));
  }
  return out;
}

async function addSlide(
  pres: Presentation,
  slide: PptxSlide,
  number: number,
  total: number,
  options: PptxRenderOptions,
  theme: PptxTheme,
  logo: Loaded | undefined,
) {
  const page = pres.addSlide();
  const background = slide.blocks.find((block) =>
    block.kind === "image" && block.background
  );
  let left = MARGIN;
  let right = WIDTH - MARGIN;

  if (background && background.kind === "image" && background.background) {
    const { side, share, contain } = background.background;
    const picture = await loadImage(background.src, options.baseDir, number);
    const w = WIDTH * share;
    const x = side === "left" ? 0 : side === "right" ? WIDTH - w : 0;
    const fit = contain
      ? (() => {
        const scale = Math.min(w / picture.width, HEIGHT / picture.height);
        const iw = picture.width * scale;
        const ih = picture.height * scale;
        return { x: x + (w - iw) / 2, y: (HEIGHT - ih) / 2, w: iw, h: ih };
      })()
      : { x, y: 0, w, h: HEIGHT };
    page.addImage({
      data: picture.data,
      ...fit,
      ...(contain ? {} : { sizing: { type: "cover", w: fit.w, h: fit.h } }),
      altText: background.alt.replace(
        /(?:^|\s)(?:bg|fit|contain|left|right)(?::\d+(?:\.\d+)?%)?(?=\s|$)/g,
        " ",
      ).trim() || "Slide image",
    });
    if (side === "left") left = w + 0.3;
    else if (side === "right") right = x - 0.3;
  }

  const width = right - left;
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
    });
  }
  if (slide.title) {
    page.addText(slide.title, {
      x: left,
      y: lead ? 1.3 : 0.4,
      w: width,
      h: lead ? 1.2 : 0.9,
      fontSize: lead ? 36 : 28,
      bold: true,
      color: theme.titleColor,
      fontFace: theme.fontFace,
      valign: "middle",
    });
  }

  const body = slide.blocks.filter((block) =>
    !(block.kind === "image" && block.background)
  );
  const top = lead ? 2.7 : BODY_TOP;
  const textBlocks = body.filter((block) => block.kind !== "image");
  const size = pickSize(textBlocks, width, BODY_BOTTOM - top);
  let y = top;
  for (const block of body) {
    if (block.kind === "paragraph" || block.kind === "quote") {
      const height = blockHeight(block, size, width);
      page.addText(
        block.runs.map((run) => ({
          text: run.text,
          options: {
            ...runOptions(run, theme, size),
            italic: block.kind === "quote" || run.italic,
          },
        })),
        { x: left, y, w: width, h: height, valign: "top", margin: 0 },
      );
      y += height;
    } else if (block.kind === "list") {
      const height = blockHeight(block, size, width);
      page.addText(flatten(block.items, block.ordered, size, theme), {
        x: left,
        y,
        w: width,
        h: height,
        valign: "top",
        margin: [0, 0, 0, 4],
      });
      y += height;
    } else if (block.kind === "table") {
      const height = blockHeight(block, size, width);
      page.addTable(
        block.rows.map((row, rowIndex) =>
          row.map((cell) => ({
            text: cell.map((run) => ({
              text: run.text,
              options: {
                ...runOptions(run, theme, 14),
                bold: run.bold || rowIndex === 0,
              },
            })),
          }))
        ),
        {
          x: left,
          y,
          w: width,
          fontSize: 14,
          border: { type: "solid", color: "D0D5DB", pt: 1 },
        },
      );
      y += height;
    } else if (block.kind === "code") {
      const height = blockHeight(block, size, width);
      page.addText(block.text, {
        x: left,
        y,
        w: width,
        h: height,
        fontFace: "Courier New",
        fontSize: 13,
        color: "D4D4D4",
        fill: { color: "1E1E1E" },
        valign: "top",
        margin: 8,
      });
      y += height + 0.1;
    } else if (block.kind === "image") {
      const picture = await loadImage(block.src, options.baseDir, number);
      const room = Math.max(1.2, BODY_BOTTOM - y);
      const scale = Math.min(width / picture.width, room / picture.height);
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
      y += h + 0.1;
    }
  }

  if (logo) {
    const w = lead ? 1.5 : 0.5;
    const h = w * (logo.height / logo.width);
    page.addImage({
      data: logo.data,
      x: lead ? left : WIDTH - 0.4 - w,
      y: lead ? 0.35 : HEIGHT - 0.2 - h,
      w,
      h,
      altText: "Logo",
    });
  }
  page.addText(`${number}/${total}`, {
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
  for (const [index, slide] of deck.slides.entries()) {
    await addSlide(
      pres,
      slide,
      index + 1,
      deck.slides.length,
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
