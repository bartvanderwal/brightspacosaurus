/**
 * Diagrams in quiz questions: the same PlantUML/Mermaid rendering as lesson
 * pages (`remark-kroki-a11y`), with the diagram source and the natural-language
 * description in native `<details>` blocks below the image (#101).
 *
 * The QTI export renders every diagram fence of a quiz in one plugin run, so
 * element ids stay unique across the file, and writes the SVG next to the
 * other quiz assets. The Docusaurus preview only needs the neutral helpers in
 * `quiz-diagram-fields.ts`: the plugin renders the fences itself, as for lessons.
 * This module uses Deno APIs, so the preview must not import it.
 *
 * @module
 */
import { join } from "@std/path";
import { unified } from "unified";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import { rehypeBrightspaceDiagramAdapter } from "./diagram-adapter.ts";
import { detectDiagramIssues } from "./diagram-validation.ts";
import {
  diagramIssueToError,
  formatDiagramWarning,
  shouldFallbackDiagramError,
  toDiagramError,
  withDiagramRendering,
} from "./diagram-renderer.ts";
import { parseQuizText, type QuizMarkdownNode } from "./quiz-markdown.ts";
import {
  diagramFences,
  diagramKey,
  type QuizDiagramField,
  titleDiagramFences,
} from "./quiz-diagram-fields.ts";
import type { ResolvedDiagramConfig } from "./types.ts";

const diagramHtml = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeBrightspaceDiagramAdapter)
  .use(rehypeStringify, { allowDangerousHtml: true });

/** Writes the SVG of every `data:` image to `assets/<sha256>.svg` and links to it. */
async function materializeSvgAssets(
  html: string,
  outputSubDir: string,
): Promise<string> {
  const dataUri = /data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g;
  let result = "";
  let last = 0;
  for (const match of html.matchAll(dataUri)) {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await Deno.mkdir(join(outputSubDir, "assets"), { recursive: true });
    await Deno.writeFile(join(outputSubDir, "assets", `${hash}.svg`), bytes);
    result += html.slice(last, match.index) + `assets/${hash}.svg`;
    last = match.index + match[0].length;
  }
  return result + html.slice(last);
}

/**
 * Renders the diagrams of a quiz to HTML, keyed by {@link diagramKey}.
 *
 * Follows the lesson policy of `diagrams.failOnError`: an invalid diagram or an
 * unreachable Kroki endpoint fails the build, or, when false, warns and leaves
 * the fenced block as it is.
 */
export async function renderQuizDiagrams(
  fields: QuizDiagramField[],
  config: ResolvedDiagramConfig,
  sourceFile: string,
  outputSubDir: string,
): Promise<Map<string, string>> {
  const rendered = new Map<string, string>();
  const slots: { key: string; container: QuizMarkdownNode }[] = [];
  for (const field of fields) {
    const root = parseQuizText(field.markdown);
    const fences = diagramFences(root);
    if (fences.length === 0) continue;
    const [issue] = detectDiagramIssues(
      field.markdown,
      `${sourceFile} (${field.id})`,
    );
    if (issue) {
      const error = diagramIssueToError(issue);
      if (!shouldFallbackDiagramError(error, config)) throw error;
      console.warn(formatDiagramWarning(error));
      continue;
    }
    titleDiagramFences(root.children ?? [], field.title);
    fences.forEach((fence, index) => {
      slots.push({
        key: diagramKey(field.id, index + 1),
        container: { type: "blockquote", children: [fence] },
      });
    });
  }
  if (slots.length === 0) return rendered;
  const htmlBySlot = new Map<string, string>();

  // One run for the whole quiz: the plugin numbers its element ids per run.
  const root: QuizMarkdownNode = {
    type: "root",
    children: slots.map((slot) => slot.container),
  };
  try {
    // deno-lint-ignore no-explicit-any
    await withDiagramRendering(unified(), config, sourceFile).run(root as any);
  } catch (error) {
    const diagramError = toDiagramError(error, sourceFile);
    if (!shouldFallbackDiagramError(diagramError, config)) throw diagramError;
    console.warn(formatDiagramWarning(diagramError));
    return rendered;
  }
  // The adapter numbers its ids per run too, so it also runs once for the whole
  // quiz: a diagram must never point at the description of another one.
  const hast = await diagramHtml.run(root as never) as { children: { type: string; tagName?: string; children: unknown[] }[] };
  const blocks = hast.children.filter((node) => node.type === "element" && node.tagName === "blockquote");
  slots.forEach((slot, index) => {
    const html = String(diagramHtml.stringify({ type: "root", children: blocks[index].children } as never)).trim();
    htmlBySlot.set(slot.key, html);
  });
  for (const [key, html] of htmlBySlot) {
    rendered.set(key, await materializeSvgAssets(html, outputSubDir));
  }
  return rendered;
}
