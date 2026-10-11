/**
 * Shared Markdown parsing for quiz text (prompts, answer options and hints).
 *
 * The QTI export and the Docusaurus preview both start from the same mdast tree
 * produced here, so inline code, fenced code and other Markdown look the same in
 * both targets (preview/output parity, Software Guidebook 8.1). Runtime-neutral:
 * no Deno or Node APIs.
 *
 * @module
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

/** Minimal mdast node shape, compatible with the trees of both targets. */
export interface QuizMarkdownNode {
  type: string;
  value?: string;
  lang?: string | null;
  children?: QuizMarkdownNode[];
  [key: string]: unknown;
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Parse quiz text into the mdast root shared by export and preview. */
export function parseQuizText(markdown: string): QuizMarkdownNode {
  return parser.runSync(parser.parse(markdown)) as unknown as QuizMarkdownNode;
}

/**
 * The block nodes of quiz text. A lone paragraph is unwrapped to its inline
 * children, so short text stays inline (for example inside an option label).
 */
export function quizTextNodes(markdown: string): {
  nodes: QuizMarkdownNode[];
  block: boolean;
} {
  const children = parseQuizText(markdown).children ?? [];
  if (children.length === 1 && children[0].type === "paragraph") {
    return { nodes: children[0].children ?? [], block: false };
  }
  return { nodes: children, block: true };
}
