/**
 * Offline diagram validation shared by rendering and future linting.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import { SUPPORTED_DIAGRAM_LANGUAGES } from "./diagram-config.ts";

/** Machine-readable categories for offline diagram authoring issues. */
export type DiagramIssueKind =
  | "unsupported-language"
  | "unknown-fence-option"
  | "invalid-src"
  | "empty-diagram"
  | "invalid-option-value";

/** One-based source location for a Markdown diagram fence. */
export interface DiagramIssuePosition {
  /** One-based line number in the source file. */
  line: number;
  /** One-based column number in the source file. */
  column: number;
}

/** A validation issue found in a Markdown diagram fence before rendering. */
export interface DiagramIssue {
  /** Machine-readable issue category. */
  kind: DiagramIssueKind;
  /** File being validated. */
  sourceFile: string;
  /** Source position of the offending fence when available. */
  position?: DiagramIssuePosition;
  /** Author-supplied diagram title when present. */
  diagramTitle?: string;
  /** Human-readable validation message. */
  message: string;
}

interface MdastNode {
  type: string;
  lang?: string | null;
  meta?: string | null;
  value?: string;
  position?: { start?: { line?: number; column?: number } };
  children?: MdastNode[];
}

const DIAGRAMISH_LANGUAGES = new Set([
  "blockdiag",
  "c4plantuml",
  "d2",
  "dot",
  "erd",
  "graphviz",
  "nomnoml",
  "seqdiag",
  "vega",
  "vegalite",
]);

const ALLOWED_FENCE_OPTIONS = new Set(["imgTitle", "imgType", "src", "title"]);

function positionOf(
  node: MdastNode,
): DiagramIssuePosition | undefined {
  const line = node.position?.start?.line;
  const column = node.position?.start?.column;
  return typeof line === "number" && typeof column === "number"
    ? { line, column }
    : undefined;
}

function parseFenceOptions(
  meta: string | null | undefined,
): Map<string, string> {
  const options = new Map<string, string>();
  if (!meta) return options;

  const optionPattern =
    /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = optionPattern.exec(meta)) !== null) {
    options.set(match[1], match[2] ?? match[3] ?? match[4] ?? "");
  }
  return options;
}

function isSupportedDiagramLanguage(
  language: string | null | undefined,
): boolean {
  return typeof language === "string" &&
    SUPPORTED_DIAGRAM_LANGUAGES.includes(
      language as typeof SUPPORTED_DIAGRAM_LANGUAGES[number],
    );
}

function isUnsupportedDiagramDeclaration(
  language: string | null | undefined,
  options: Map<string, string>,
): boolean {
  if (typeof language !== "string") return false;
  return DIAGRAMISH_LANGUAGES.has(language) || options.has("imgType");
}

function isInvalidSrc(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/") ||
    value.includes("..");
}

function diagramTitle(options: Map<string, string>): string | undefined {
  return options.get("imgTitle") ?? options.get("title");
}

function detectCodeIssues(node: MdastNode, sourceFile: string): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const options = parseFenceOptions(node.meta);
  const position = positionOf(node);
  const title = diagramTitle(options);
  const language = node.lang ?? "";
  const supported = isSupportedDiagramLanguage(language);

  if (!supported && isUnsupportedDiagramDeclaration(language, options)) {
    issues.push({
      kind: "unsupported-language",
      sourceFile,
      position,
      diagramTitle: title,
      message:
        `Unsupported diagram language '${language}'. Supported languages are plantuml, mermaid, and kroki.`,
    });
  }

  if (!supported) return issues;

  if (!node.value || node.value.trim().length === 0) {
    issues.push({
      kind: "empty-diagram",
      sourceFile,
      position,
      diagramTitle: title,
      message: `Empty ${language} diagram block.`,
    });
  }

  for (const [name, value] of options) {
    if (!ALLOWED_FENCE_OPTIONS.has(name)) {
      issues.push({
        kind: "unknown-fence-option",
        sourceFile,
        position,
        diagramTitle: title,
        message: `Unknown diagram fence option '${name}'.`,
      });
    }
    if (name === "src" && isInvalidSrc(value)) {
      issues.push({
        kind: "invalid-src",
        sourceFile,
        position,
        diagramTitle: title,
        message:
          `Diagram src must be a local relative path inside the project: '${value}'.`,
      });
    }
    if (name === "imgType" && value !== language) {
      issues.push({
        kind: "invalid-option-value",
        sourceFile,
        position,
        diagramTitle: title,
        message:
          `Diagram imgType '${value}' does not match fence language '${language}'.`,
      });
    }
  }

  return issues;
}

/** Detects diagram authoring issues without contacting Kroki. */
export function detectDiagramIssues(
  markdown: string,
  sourceFile: string,
): DiagramIssue[] {
  const tree = unified().use(remarkParse).parse(markdown) as MdastNode;
  const issues: DiagramIssue[] = [];

  function walk(node: MdastNode): void {
    if (node.type === "code") {
      issues.push(...detectCodeIssues(node, sourceFile));
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  }

  walk(tree);
  return issues;
}
