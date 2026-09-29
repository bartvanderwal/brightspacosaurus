/** Shared remark transformation for Brightspace HTML and Docusaurus/MDX. */

/** Minimal Markdown node shape accepted by the flashcard transformation. */
export interface FlashcardNode {
  type: string;
  name?: string;
  value?: string;
  children?: FlashcardNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, string>;
    [key: string]: unknown;
  };
}

function nodeText(node: FlashcardNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function element(
  tag: string,
  className: string,
  children: FlashcardNode[],
  properties: Record<string, string> = {},
): FlashcardNode {
  return {
    type: "bsoFlashcardElement",
    data: { hName: tag, hProperties: { className, ...properties } },
    children,
  };
}

/**
 * Convert parsed flashcard directives to semantic elements without raw HTML.
 * Both remark-rehype and Docusaurus/MDX honor these hName/hProperties fields.
 * Definitions start visible, so the content remains readable without scripts.
 */
export function remarkFlashcards(): (tree: FlashcardNode) => void {
  return function walk(node: FlashcardNode): void {
    for (const child of node.children ?? []) walk(child);
    if (node.type !== "containerDirective") return;

    if (node.name === "flashcards") {
      node.data = {
        ...node.data,
        hName: "section",
        hProperties: { className: "bso-flashcards" },
      };
    } else if (node.name === "flashcard") {
      const first = node.children?.[0];
      const line = first?.type === "paragraph" ? nodeText(first) : "";
      if (!line.startsWith("term:") || !line.slice(5).trim()) return;

      node.data = {
        ...node.data,
        hName: "article",
        hProperties: { className: "bso-flashcard" },
      };
      node.children = [
        element("button", "bso-flashcard-toggle", [
          element("span", "bso-flashcard-term", [{
            type: "text",
            value: line.slice(5).trim(),
          }]),
        ], { type: "button", "aria-expanded": "true" }),
        element(
          "div",
          "bso-flashcard-definition",
          node.children?.slice(1) ?? [],
        ),
      ];
    }
  };
}
