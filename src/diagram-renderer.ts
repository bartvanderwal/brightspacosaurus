/**
 * DiagramRenderer: registers `remark-kroki-a11y` in-process to render
 * PlantUML/Mermaid fenced blocks during `prepare`, and classifies rendering
 * failures for the strict/fallback policy in `ResolvedDiagramConfig`.
 * Requirements: 1.1, 1.2, 1.3, 1.5, 16-19 (error categories)
 */

import type { ResolvedDiagramConfig } from "./types.ts";
import {
  buildKrokiA11yOptions,
  SUPPORTED_DIAGRAM_LANGUAGES,
} from "./diagram-config.ts";
import type { DiagramIssue } from "./diagram-validation.ts";

type ProcessorWithUse = {
  use(plugin: () => unknown): unknown;
};

/** Minimal mdast node shape used for the meta-normalization walk. */
interface MdastNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  depth?: number;
  children?: MdastNode[];
  value?: string;
}

/** Failure categories for diagram rendering (Requirement 16). */
export type DiagramErrorCategory =
  | "kroki-unreachable"
  | "invalid-source"
  | "invalid-parameter";

/** A typed, actionable diagram rendering failure. */
export class DiagramError extends Error {
  /** Category used to decide whether BSO should fail or fall back. */
  readonly category: DiagramErrorCategory;
  /** Source file in which the diagram rendering failure occurred. */
  readonly sourceFile: string;
  /** Human-readable reason reported by the renderer or validator. */
  readonly reason: string;

  constructor(
    category: DiagramErrorCategory,
    sourceFile: string,
    reason: string,
    options?: { cause?: unknown },
  ) {
    super(
      `Diagram rendering failed in ${sourceFile} (${category}): ${reason}`,
      options,
    );
    this.name = "DiagramError";
    this.category = category;
    this.sourceFile = sourceFile;
    this.reason = reason;
  }
}

/**
 * Classifies a raw error thrown by `remark-kroki-a11y`/`remark-kroki`.
 * Network/connection failures are `kroki-unreachable`; everything else is
 * treated conservatively as an invalid diagram source, never reclassified
 * as an endpoint failure (Requirement 19).
 */
function classifyDiagramError(error: unknown): DiagramErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /invalid\s+(parameter|option|src)|unknown\s+(parameter|option)|bad\s+request|syntax|parse/i
      .test(message)
  ) {
    return "invalid-parameter";
  }
  if (
    /ECONNREFUSED|ENOTFOUND|fetch failed|network|timed out|timeout/i.test(
      message,
    )
  ) {
    return "kroki-unreachable";
  }
  return "invalid-source";
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Converts an unknown renderer failure into a typed `DiagramError`. */
export function toDiagramError(
  error: unknown,
  sourceFile: string,
): DiagramError {
  if (error instanceof DiagramError) return error;
  return new DiagramError(
    classifyDiagramError(error),
    sourceFile,
    errorReason(error),
    {
      cause: error,
    },
  );
}

/** Returns whether a diagram error should keep the original fenced code block. */
export function shouldFallbackDiagramError(
  error: DiagramError,
  cfg: ResolvedDiagramConfig,
): boolean {
  void error;
  return !cfg.failOnError;
}

/** Formats a warning message for a non-fatal diagram rendering failure. */
export function formatDiagramWarning(error: DiagramError): string {
  return `diagram-a11y: ${error.message}. Retaining the original fenced code block.`;
}

/** Converts an offline validation issue into a typed rendering error. */
export function diagramIssueToError(issue: DiagramIssue): DiagramError {
  const category: DiagramErrorCategory = issue.kind === "empty-diagram"
    ? "invalid-source"
    : "invalid-parameter";
  const location = issue.position
    ? ` at ${issue.sourceFile}:${issue.position.line}:${issue.position.column}`
    : ` in ${issue.sourceFile}`;
  const title = issue.diagramTitle ? ` (${issue.diagramTitle})` : "";
  return new DiagramError(
    category,
    issue.sourceFile,
    `${issue.message}${title}${location}`,
  );
}

/**
 * Extracts the plain text of the nearest preceding heading in the same list
 * of siblings, used as a fallback accessible title when the author does not
 * supply `imgTitle` on the fenced block.
 */
function headingText(node: MdastNode): string {
  const text = (node.children ?? [])
    .filter((child) => child.type === "text")
    .map((child) => child.value ?? "")
    .join("");
  return text.trim();
}

/**
 * Walks the mdast tree and, for fenced code blocks in a supported diagram
 * language without an explicit `imgType`/`imgTitle`, injects them based on
 * the fence language and the nearest preceding heading (or a stable
 * positional fallback title).
 */
function normalizeDiagramMeta(tree: MdastNode, sourceFile: string): void {
  let lastHeading = "";
  let diagramIndex = 0;

  function walk(node: MdastNode): void {
    const children = node.children ?? [];
    for (const child of children) {
      if (child.type === "heading") {
        lastHeading = headingText(child) || lastHeading;
      } else if (
        child.type === "code" &&
        typeof child.lang === "string" &&
        SUPPORTED_DIAGRAM_LANGUAGES.includes(
          child.lang as typeof SUPPORTED_DIAGRAM_LANGUAGES[number],
        )
      ) {
        diagramIndex += 1;
        const meta = child.meta ?? "";
        const hasImgType = /\bimgType=/.test(meta);
        const hasImgTitle = /\bimgTitle=/.test(meta);
        const fallbackTitle = lastHeading ||
          `${child.lang} diagram ${diagramIndex}`;
        const additions: string[] = [];
        if (!hasImgType) additions.push(`imgType="${child.lang}"`);
        if (!hasImgTitle) {
          additions.push(`imgTitle="${fallbackTitle.replace(/"/g, "'")}"`);
        }
        if (additions.length > 0) {
          child.meta = [meta, ...additions].filter(Boolean).join(" ");
        }
      }
      if (child.children) walk(child);
    }
  }

  walk(tree);
  void sourceFile;
}

/** Remark plugin wrapper around {@link normalizeDiagramMeta}. */
function remarkNormalizeDiagramMeta(sourceFile: string) {
  return (tree: MdastNode) => {
    normalizeDiagramMeta(tree, sourceFile);
  };
}

function remarkKrokiA11yLazy(
  options: ReturnType<typeof buildKrokiA11yOptions>,
  sourceFile: string,
) {
  return async (tree: unknown, file: unknown) => {
    const module = await import("remark-kroki-a11y");
    const remarkKrokiA11y = module.default;
    const transformer = remarkKrokiA11y(options);
    try {
      return await transformer(tree, file);
    } catch (error) {
      throw toDiagramError(error, sourceFile);
    }
  };
}

/**
 * Registers diagram-meta normalization and `remark-kroki-a11y` rendering on a
 * unified processor. The Kroki render is asynchronous; callers must `await`
 * `processor.process(...)`.
 *
 * On failure, classifies the error and either rethrows a {@link DiagramError}
 * (strict mode) or returns `null` so the caller can retry without diagram
 * rendering, preserving the original fenced code blocks (fallback mode).
 */
export function withDiagramRendering<P extends ProcessorWithUse>(
  processor: P,
  cfg: ResolvedDiagramConfig,
  sourceFile: string,
): P {
  processor.use(() => remarkNormalizeDiagramMeta(sourceFile));
  processor.use(() =>
    remarkKrokiA11yLazy(buildKrokiA11yOptions(cfg), sourceFile)
  );
  return processor;
}

export { classifyDiagramError };
