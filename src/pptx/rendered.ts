import pptxgenModule from "pptxgenjs";
import {
  type Box,
  type BrowserExportOptions,
  type MeasuredSlide,
  measureSlides,
} from "./browser.ts";
import { stabilize } from "./renderer.ts";

type Presentation = InstanceType<typeof pptxgenModule.default>;
const PptxGenJS = pptxgenModule as unknown as typeof pptxgenModule.default;

export interface RenderedPptxRequest extends BrowserExportOptions {
  /** Expanded source, retained at the export boundary for provenance and diagnostics. */
  markdown: string;
  notes: boolean;
  title?: string;
}

export interface RenderedPptxResult {
  bytes: Uint8Array;
  teacher?: Uint8Array;
}

export type RenderedPptxExporter = (
  request: RenderedPptxRequest,
) => Promise<RenderedPptxResult>;

function hyperlink(target: string, count: number) {
  if (/^#\d+$/.test(target)) {
    const slide = Number(target.slice(1));
    if (slide < 1 || slide > count) {
      throw new Error(`PPTX link '${target}' refers to a missing slide.`);
    }
    return { slide };
  }
  if (/^(https?:|mailto:)/i.test(target)) return { url: target };
  throw new Error(
    `PPTX link '${target}' is not a resolved slide link or HTTP(S)/mailto URL.`,
  );
}

export async function assembleRenderedPptx(
  slides: MeasuredSlide[],
  options: Pick<RenderedPptxRequest, "mode" | "notes" | "title">,
): Promise<Uint8Array> {
  if (!slides.length) throw new Error("Cannot export an empty slide deck.");
  const pres: Presentation = new PptxGenJS();
  const first = slides[0];
  pres.defineLayout({
    name: "MARP",
    width: 10,
    height: 10 * first.height / first.width,
  });
  pres.layout = "MARP";
  pres.title = options.title ?? "Slides";
  for (const [index, layout] of slides.entries()) {
    if (layout.width !== first.width || layout.height !== first.height) {
      throw new Error(
        `Slide ${index + 1}: slide dimensions differ within the deck.`,
      );
    }
    const page = pres.addSlide();
    page.background = { color: layout.background };
    const factor = 10 / layout.width;
    const box = (value: Box) => ({
      x: value.x * factor,
      y: value.y * factor,
      w: value.w * factor,
      h: value.h * factor,
    });
    if (options.mode === "raster") {
      if (!layout.raster) {
        throw new Error(`Slide ${index + 1}: missing raster capture.`);
      }
      page.addImage({
        data: layout.raster,
        x: 0,
        y: 0,
        w: 10,
        h: 10 * layout.height / layout.width,
      });
    } else {
      for (const shape of layout.shapes) {
        page.addShape(
          shape.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect,
          {
            ...box(shape),
            rectRadius: 0.04,
            line: { color: shape.fill, transparency: 100 },
            fill: { color: shape.fill },
          },
        );
      }
      for (const image of layout.images) {
        page.addImage({
          ...box(image),
          data: image.data,
          ...(image.framed
            ? {
              shadow: {
                type: "outer" as const,
                color: "000000",
                blur: 3,
                angle: 90,
                offset: 1.5,
                opacity: 0.18,
              },
            }
            : {}),
        });
      }
      for (const run of layout.text) {
        if (!run.text.trim()) continue;
        page.addText(run.text, {
          ...box(run),
          w: Math.min(run.w + 1, layout.width - run.x) * factor,
          fontFace: run.font,
          fontSize: run.size * factor * 72,
          color: run.color,
          bold: run.bold,
          italic: run.italic,
          margin: 0,
          breakLine: false,
          valign: "middle",
          wrap: false,
          fit: "shrink",
          paraSpaceAfter: 0,
          charSpacing: 0,
          ...(run.link
            ? { hyperlink: hyperlink(run.link, slides.length) }
            : {}),
        });
      }
    }
    // Transparent shapes keep hyperlinks clickable even when all visible content is raster.
    for (const link of layout.links) {
      page.addShape(pres.ShapeType.rect, {
        ...box(link),
        fill: { color: "FFFFFF", transparency: 100 },
        line: { color: "FFFFFF", transparency: 100 },
        hyperlink: hyperlink(link.target, slides.length),
      });
    }
    if (options.notes && layout.notes) page.addNotes(layout.notes);
  }
  const bytes = await pres.write({
    outputType: "uint8array",
    compression: true,
  }) as Uint8Array;
  return await stabilize(bytes, "2000-01-01T00:00:00Z");
}

export const exportRenderedPptx: RenderedPptxExporter = async (request) => {
  const { slides, title } = await measureSlides(request);
  const options = { ...request, title: request.title ?? (title || "Slides") };
  return {
    bytes: await assembleRenderedPptx(slides, options),
    teacher: !request.notes && slides.some((slide) => slide.notes)
      ? await assembleRenderedPptx(slides, { ...options, notes: true })
      : undefined,
  };
};
