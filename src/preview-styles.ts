/**
 * Puts BSO's complete stylesheet in the Docusaurus app for `bso preview` (#95).
 *
 * A course app cannot import `brightspacosaurus.css` from the package: JSR does
 * not allow CSS exports, and a path into a BSO checkout or `node_modules` is
 * fragile. The CLI that runs the preview always has the stylesheet, so it
 * writes it next to the app's own styles, ready for `@import`.
 *
 * @module
 */
import { join } from "@std/path";
import { loadAssetText } from "./assets.ts";

/** Directory inside the Docusaurus app that receives generated preview files. */
export const PREVIEW_GENERATED_DIR = join("src", "generated");

/** File name of the stylesheet, as imported from `src/css/custom.css`. */
export const PREVIEW_STYLESHEET = "brightspacosaurus.css";

/**
 * Writes `<docusaurusDir>/src/generated/brightspacosaurus.css` and a
 * `.gitignore` that keeps the generated files out of the course repository.
 * Files are only rewritten when their content changes, so a running Docusaurus
 * dev server does not reload for nothing.
 *
 * @returns The path of the stylesheet.
 */
export async function writePreviewStylesheet(
  docusaurusDir: string,
): Promise<string> {
  const dir = join(docusaurusDir, PREVIEW_GENERATED_DIR);
  await Deno.mkdir(dir, { recursive: true });
  const stylesheet = join(dir, PREVIEW_STYLESHEET);
  await writeIfChanged(stylesheet, await loadAssetText(PREVIEW_STYLESHEET));
  await writeIfChanged(join(dir, ".gitignore"), "*\n");
  return stylesheet;
}

async function writeIfChanged(path: string, content: string): Promise<void> {
  try {
    if (await Deno.readTextFile(path) === content) return;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  await Deno.writeTextFile(path, content);
}
