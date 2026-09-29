/** Shared remark transformation for Brightspace HTML and Docusaurus/MDX. */

/** Optional automatic conversion of term/definition lists under these headings. */
export interface FlashcardsConfig {
  /** Case-insensitive heading titles. Empty or omitted disables automatic conversion. */
  sectionHeadings?: string[];
}

/** Validate options for both BSO configuration and direct remark plugin use. */
export function resolveFlashcardsOptions(
  value?: unknown,
): Required<FlashcardsConfig> {
  if (value === undefined) return { sectionHeadings: [] };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Field 'flashcards' must be an object.");
  }
  const options = value as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (key !== "sectionHeadings") {
      throw new Error(`Unknown configuration field 'flashcards.${key}'.`);
    }
  }
  const headings = options.sectionHeadings;
  if (headings === undefined) return { sectionHeadings: [] };
  if (
    !Array.isArray(headings) ||
    headings.some((heading) => typeof heading !== "string" || !heading.trim())
  ) {
    throw new Error(
      "Field 'flashcards.sectionHeadings' must be an array of non-empty strings.",
    );
  }
  return { sectionHeadings: headings.map((heading: string) => heading.trim()) };
}

/** Minimal Markdown node shape accepted by the flashcard transformation. */
export interface FlashcardNode {
  type: string;
  name?: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  checked?: boolean | null;
  children?: FlashcardNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, string>;
    [key: string]: unknown;
  };
}

function card(term: string, body: FlashcardNode[]): FlashcardNode[] {
  return [
    element("button", "bso-flashcard-toggle", [
      element("span", "bso-flashcard-term", [{ type: "text", value: term }]),
    ], { type: "button", "aria-expanded": "true" }),
    element("div", "bso-flashcard-definition", body),
  ];
}

/** Remove a visible-text prefix while retaining the remaining inline Markdown. */
function dropPrefix(nodes: FlashcardNode[], count: number): FlashcardNode[] {
  const result: FlashcardNode[] = [];
  for (const node of nodes) {
    const length = nodeText(node).length;
    if (count > 0 && count >= length) {
      count -= length;
      continue;
    }
    if (count === 0) result.push(node);
    else if (node.children) {
      result.push({ ...node, children: dropPrefix(node.children, count) });
    } else {
      result.push({ ...node, value: node.value!.slice(count) });
    }
    count = 0;
  }
  return result;
}

function listCards(list: FlashcardNode): FlashcardNode[] | null {
  if (list.type !== "list" || list.ordered || !list.children?.length) {
    return null;
  }
  const cards: FlashcardNode[] = [];
  for (const item of list.children) {
    const first = item.children?.[0];
    if (first?.type !== "paragraph" || item.checked != null) return null;
    const text = nodeText(first);
    const colon = text.indexOf(":");
    const term = text.slice(0, colon).trim();
    if (colon < 0 || !term) return null;
    const offset = text.length - text.slice(colon + 1).trimStart().length;
    const body = [
      { ...first, children: dropPrefix(first.children ?? [], offset) },
      ...item.children!.slice(1),
    ];
    if (!body.some((node) => nodeText(node).trim())) return null;
    cards.push(element("article", "bso-flashcard", card(term, body)));
  }
  return cards;
}

/** Whether a list can be converted in full; also used by the course linter. */
export function isFlashcardList(node: FlashcardNode): boolean {
  return listCards(node) !== null;
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
export function remarkFlashcards(
  options?: FlashcardsConfig,
): (tree: FlashcardNode) => void {
  const headings = new Set(
    resolveFlashcardsOptions(options).sectionHeadings.map((heading) =>
      heading.toLowerCase()
    ),
  );
  return function walk(node: FlashcardNode): void {
    let sectionDepth: number | undefined;
    if (node.children) {
      node.children = node.children.flatMap((child) => {
        if (child.type === "heading") {
          if (sectionDepth !== undefined && child.depth! <= sectionDepth) {
            sectionDepth = undefined;
          }
          if (headings.has(nodeText(child).trim().toLowerCase())) {
            sectionDepth ??= child.depth;
          }
        }
        if (
          sectionDepth !== undefined ||
          (node.type === "containerDirective" && node.name === "flashcards")
        ) {
          const cards = listCards(child);
          if (cards) {
            return node.type === "containerDirective" &&
                node.name === "flashcards"
              ? cards
              : element("section", "bso-flashcards", cards);
          }
        }
        return child;
      });
    }
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
      node.children = card(line.slice(5).trim(), node.children?.slice(1) ?? []);
    }
  };
}
