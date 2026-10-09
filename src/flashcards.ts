/** Shared remark transformation for Brightspace HTML and Docusaurus/MDX. */

/** Optional automatic conversion of term/definition lists under these headings. */
export interface FlashcardsConfig {
  /**
   * Case-insensitive heading titles; a leading number such as `7.` or `2.3`
   * is ignored. Omitted means {@link DEFAULT_SECTION_HEADINGS}; empty disables
   * automatic conversion.
   */
  sectionHeadings?: string[];
  /**
   * Language of the button labels. BSO fills this in from `diagrams.locale`,
   * so courses do not set it; direct plugin use defaults to `en`.
   */
  locale?: "nl" | "en";
}

/** Fully resolved flashcard options. */
export type ResolvedFlashcardsConfig = Required<FlashcardsConfig>;

/** Labels of the "all definitions" button, per locale. */
export const FLASHCARD_LABELS = {
  nl: { show: "Toon definities", hide: "Verberg definities" },
  en: { show: "Show definitions", hide: "Hide definitions" },
} as const;

/** Section headings recognized when `flashcards.sectionHeadings` is omitted. */
export const DEFAULT_SECTION_HEADINGS: readonly string[] = ["Core concepts"];

/**
 * Comparison key for section headings: trimmed, lowercase and without a
 * leading section number, so `7. Kernbegrippen` matches `Kernbegrippen`.
 */
export function normalizeSectionHeading(title: string): string {
  return title.trim().replace(/^\d+(?:\.\d+)*\.?\s+/, "").toLowerCase();
}

/**
 * Validate options for both BSO configuration and direct remark plugin use.
 * `defaultLocale` applies when `locale` is not set in the options.
 */
export function resolveFlashcardsOptions(
  value?: unknown,
  defaultLocale: "nl" | "en" = "en",
): ResolvedFlashcardsConfig {
  const defaults: ResolvedFlashcardsConfig = {
    sectionHeadings: [...DEFAULT_SECTION_HEADINGS],
    locale: defaultLocale,
  };
  if (value === undefined) return defaults;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Field 'flashcards' must be an object.");
  }
  const options = value as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (!["sectionHeadings", "locale"].includes(key)) {
      throw new Error(`Unknown configuration field 'flashcards.${key}'.`);
    }
  }
  const { sectionHeadings: headings, locale } = options;
  if (
    headings !== undefined &&
    (!Array.isArray(headings) ||
      headings.some((heading) =>
        typeof heading !== "string" || !heading.trim()
      ))
  ) {
    throw new Error(
      "Field 'flashcards.sectionHeadings' must be an array of non-empty strings.",
    );
  }
  if (locale !== undefined && locale !== "nl" && locale !== "en") {
    throw new Error('Field \'flashcards.locale\' must be "nl" or "en".');
  }
  return {
    sectionHeadings: headings
      ? (headings as string[]).map((heading) => heading.trim())
      : defaults.sectionHeadings,
    locale: locale ?? defaults.locale,
  };
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

function card(
  term: string,
  body: FlashcardNode[],
  inlineDefinition = false,
): FlashcardNode[] {
  const definitionClass = inlineDefinition && body.length === 1 &&
      body[0].type === "paragraph"
    ? "bso-flashcard-definition bso-flashcard-definition-inline"
    : "bso-flashcard-definition";
  return [
    element("button", "bso-flashcard-toggle", [
      element("span", "bso-flashcard-term", [{ type: "text", value: term }]),
    ], { type: "button", "aria-expanded": "true" }),
    element("div", definitionClass, body),
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

function listCards(
  list: FlashcardNode,
  compact = false,
): FlashcardNode[] | null {
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
    cards.push(
      element(
        compact ? "li" : "article",
        "bso-flashcard",
        card(term, body, compact),
      ),
    );
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
  const resolved = resolveFlashcardsOptions(options);
  const headings = new Set(
    resolved.sectionHeadings.map(normalizeSectionHeading),
  );
  const labels = FLASHCARD_LABELS[resolved.locale];
  const labelProperties = {
    "data-bso-show-label": labels.show,
    "data-bso-hide-label": labels.hide,
  };
  const compactClass = "bso-flashcards bso-flashcards-compact";
  return function walk(node: FlashcardNode): void {
    let sectionDepth: number | undefined;
    if (node.children) {
      node.children = node.children.flatMap((child) => {
        if (child.type === "heading") {
          if (sectionDepth !== undefined && child.depth! <= sectionDepth) {
            sectionDepth = undefined;
          }
          if (headings.has(normalizeSectionHeading(nodeText(child)))) {
            sectionDepth ??= child.depth;
          }
        }
        if (
          sectionDepth !== undefined ||
          (node.type === "containerDirective" && node.name === "flashcards")
        ) {
          const compact = !(
            node.type === "containerDirective" && node.name === "flashcards"
          );
          const cards = listCards(child, compact);
          if (cards) {
            if (!compact) return cards;
            return element(
              "section",
              compactClass,
              [element("ul", "bso-flashcard-list", cards)],
              labelProperties,
            );
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
        hProperties: { className: "bso-flashcards", ...labelProperties },
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
