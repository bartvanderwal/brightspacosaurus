/**
 * Converts a BSO slide deck (Marp Markdown) to an editable PowerPoint file.
 *
 * @module
 */

import { parseDeck } from "./deck-parser.ts";
import { type PptxRenderOptions, renderDeck } from "./renderer.ts";

export { parseDeck } from "./deck-parser.ts";
export type { PptxBlock, PptxDeck, PptxSlide } from "./deck-parser.ts";
export type { PptxRenderOptions, PptxTheme } from "./renderer.ts";

/**
 * Turns the Markdown of a slide deck into the bytes of a `.pptx`. The same slide deck and
 * options always give the same bytes.
 */
export async function convertDeckToPptx(
  markdown: string,
  options: PptxRenderOptions,
): Promise<Uint8Array> {
  return await renderDeck(parseDeck(markdown), options);
}
