/**
 * Syntax highlighting for code in quiz questions, options and hints (#103).
 *
 * A QTI question has no stylesheet, so the Prism token classes that lesson pages
 * style through `brightspacosaurus.css` would render unstyled. This rehype
 * plugin therefore writes the colors as inline `style`: a dark block with a
 * border for code blocks, the lesson-page grey for inline code, token colors on
 * the spans.
 *
 * @module
 */

import rehypePrismPlus from "rehype-prism-plus";

/** Minimal hast node shape. */
interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Code block colors: the Palenight theme the Docusaurus preview uses. */
export const QUIZ_CODE_BLOCK_STYLE =
  "background:#292d3e;color:#bfc7d5;border:1px solid #1b1e2b;border-radius:8px;padding:0.75rem 1rem;overflow-x:auto;font-family:JetBrains Mono,Fira Code,Consolas,monospace;font-size:0.85em;line-height:1.5";

/** Inline code looks like on lesson pages (`brightspacosaurus.css`, `--han-code-bg`). */
export const QUIZ_INLINE_CODE_STYLE =
  "background:#f5f5f5;border:1px solid #e0e0e0;border-radius:4px;padding:0.15em 0.4em;font-family:JetBrains Mono,Fira Code,Consolas,monospace;font-size:0.875em";

/** Token colors on the dark block; all meet WCAG AA (4.5:1) on `#292d3e`. */
export const QUIZ_TOKEN_STYLES: ReadonlyArray<[string, string]> = [
  ["comment", "color:#8f98c0;font-style:italic"],
  ["prolog", "color:#8f98c0;font-style:italic"],
  ["doctype", "color:#8f98c0;font-style:italic"],
  ["cdata", "color:#8f98c0;font-style:italic"],
  ["string", "color:#c3e88d"],
  ["char", "color:#c3e88d"],
  ["attr-value", "color:#c3e88d"],
  ["punctuation", "color:#89ddff"],
  ["operator", "color:#89ddff"],
  ["number", "color:#f78c6c"],
  ["boolean", "color:#ff9cac"],
  ["constant", "color:#f78c6c"],
  ["variable", "color:#f07178"],
  ["property", "color:#80cbc4"],
  ["regex", "color:#89ddff"],
  ["url", "color:#80cbc4"],
  ["entity", "color:#f78c6c"],
  ["atrule", "color:#c792ea"],
  ["attr-name", "color:#ffcb6b"],
  ["annotation", "color:#ffcb6b"],
  ["function", "color:#82aaff"],
  ["class-name", "color:#ffcb6b"],
  ["function-variable", "color:#82aaff"],
  ["keyword", "color:#c792ea;font-style:italic"],
  ["tag", "color:#f07178"],
  ["selector", "color:#f07178"],
];

function classNames(node: HastNode): string[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function setStyle(node: HastNode, style: string): void {
  node.properties = { ...node.properties, style };
}

function inlineStyles(node: HastNode, parent?: HastNode): void {
  if (node.tagName === "pre") {
    setStyle(node, QUIZ_CODE_BLOCK_STYLE);
  } else if (node.tagName === "code" && parent?.tagName !== "pre") {
    setStyle(node, QUIZ_INLINE_CODE_STYLE);
  } else if (node.tagName === "span") {
    const classes = classNames(node);
    if (classes.includes("token")) {
      let style: string | undefined;
      for (const [name, css] of QUIZ_TOKEN_STYLES) {
        if (classes.includes(name)) style = css;
      }
      if (style) setStyle(node, style);
    }
  }
  for (const child of node.children ?? []) inlineStyles(child, node);
}

/** Prism highlighting with inline token colors; unknown languages stay plain. */
export function rehypeQuizHighlight() {
  const prism = (rehypePrismPlus as unknown as (
    options: { ignoreMissing: boolean },
  ) => (tree: HastNode) => void)({ ignoreMissing: true });
  return (tree: HastNode) => {
    prism(tree);
    inlineStyles(tree);
  };
}
