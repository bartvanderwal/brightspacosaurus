/**
 * Callout blocks written as the alert syntax of GitHub and GitLab
 * (`> [!NOTE]`), shared by the Brightspace HTML and Docusaurus/MDX like the
 * flashcards. The block gets the same HTML and the same stylesheet in both.
 *
 * @module
 */

/** The kinds of block. `optional` is a BSO addition to the GitHub set. */
export const ADMONITION_TYPES = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
  "optional",
] as const;

export type AdmonitionType = (typeof ADMONITION_TYPES)[number];

/** Optional settings for the admonitions. */
export interface AdmonitionsConfig {
  /** Replaces the label of one type; a custom title in the source replaces both. */
  labels?: Partial<Record<AdmonitionType, string>>;
  /**
   * Language of the labels. BSO fills this in from `diagrams.locale`, so
   * courses do not set it; direct plugin use defaults to `en`.
   */
  locale?: "nl" | "en";
}

/** Fully resolved options. */
export interface ResolvedAdmonitionsConfig {
  labels: Record<AdmonitionType, string>;
  locale: "nl" | "en";
}

/** The label of each type, per locale. */
export const ADMONITION_LABELS: Record<
  "nl" | "en",
  Record<AdmonitionType, string>
> = {
  nl: {
    note: "Opmerking",
    tip: "Tip",
    important: "Belangrijk",
    warning: "Let op",
    caution: "Pas op",
    optional: "Optioneel",
  },
  en: {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
    optional: "Optional",
  },
};

/** Validate options for both BSO configuration and direct remark plugin use. */
export function resolveAdmonitionsOptions(
  value?: unknown,
  defaultLocale: "nl" | "en" = "en",
): ResolvedAdmonitionsConfig {
  let locale = defaultLocale;
  let overrides: Record<string, unknown> = {};
  if (value !== undefined) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Field 'admonitions' must be an object.");
    }
    const options = value as Record<string, unknown>;
    for (const key of Object.keys(options)) {
      if (key !== "labels" && key !== "locale") {
        throw new Error(`Unknown configuration field 'admonitions.${key}'.`);
      }
    }
    if (options.locale !== undefined) {
      if (options.locale !== "nl" && options.locale !== "en") {
        throw new Error("Field 'admonitions.locale' must be 'nl' or 'en'.");
      }
      locale = options.locale;
    }
    if (options.labels !== undefined) {
      const labels = options.labels;
      if (
        typeof labels !== "object" || labels === null || Array.isArray(labels)
      ) {
        throw new Error("Field 'admonitions.labels' must be an object.");
      }
      overrides = labels as Record<string, unknown>;
      for (const [type, label] of Object.entries(overrides)) {
        if (!(ADMONITION_TYPES as readonly string[]).includes(type)) {
          throw new Error(
            `Unknown admonition type 'admonitions.labels.${type}'; use ${
              ADMONITION_TYPES.join(", ")
            }.`,
          );
        }
        if (typeof label !== "string" || label.trim() === "") {
          throw new Error(
            `Field 'admonitions.labels.${type}' must be a non-empty string.`,
          );
        }
      }
    }
  }
  const labels = { ...ADMONITION_LABELS[locale] };
  for (const [type, label] of Object.entries(overrides)) {
    labels[type as AdmonitionType] = (label as string).trim();
  }
  return { labels, locale };
}

/** What a first line `[!WORD] title` says. */
export interface AdmonitionMarker {
  /** The word between `[!` and `]`, as written. */
  word: string;
  /** The type, when the word is a known one. */
  type?: AdmonitionType;
  /** Text after the marker on the same line. */
  title: string;
  /** What follows the first line break; empty when the marker line is all. */
  rest: string;
}

/** The marker on the first line of a block quote's text, if there is one. */
export function parseAdmonitionMarker(
  text: string,
): AdmonitionMarker | undefined {
  const match = text.match(
    /^\[!([A-Za-z][A-Za-z-]*)\][ \t]*([^\n]*)(?:\n([\s\S]*))?$/,
  );
  if (!match) return undefined;
  const word = match[1];
  const type = ADMONITION_TYPES.find((each) => each === word.toLowerCase());
  return { word, type, title: match[2].trim(), rest: match[3] ?? "" };
}

/** The part of a Markdown syntax tree that this module reads and writes. */
export interface AdmonitionNode {
  type: string;
  value?: string;
  children?: AdmonitionNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

function element(
  tag: string,
  className: string,
  children: AdmonitionNode[],
  properties: Record<string, unknown> = {},
): AdmonitionNode {
  return {
    type: "bsoAdmonitionElement",
    data: { hName: tag, hProperties: { className, ...properties } },
    children,
  };
}

/** The marker of a block quote: its first paragraph starts with a text node. */
function markerOf(
  node: AdmonitionNode,
): { marker: AdmonitionMarker; paragraph: AdmonitionNode } | undefined {
  if (node.type !== "blockquote") return undefined;
  const paragraph = node.children?.[0];
  const first = paragraph?.children?.[0];
  if (paragraph?.type !== "paragraph" || first?.type !== "text") {
    return undefined;
  }
  const marker = parseAdmonitionMarker(first.value ?? "");
  return marker ? { marker, paragraph } : undefined;
}

/**
 * Turn block quotes that start with `[!TYPE]` into admonition elements,
 * without raw HTML: remark-rehype and Docusaurus/MDX both honor the
 * hName/hProperties fields.
 */
export function remarkAdmonitions(
  options?: AdmonitionsConfig,
): (tree: AdmonitionNode) => void {
  const resolved = resolveAdmonitionsOptions(options);
  return function walk(node: AdmonitionNode): void {
    for (const child of node.children ?? []) walk(child);
    const found = markerOf(node);
    const type = found?.marker.type;
    if (!found || !type) return;
    const { marker, paragraph } = found;
    const first = paragraph.children![0];
    // The rest of the first paragraph is content; an empty one disappears.
    if (marker.rest) first.value = marker.rest;
    else paragraph.children!.shift();
    if (paragraph.children!.length === 0) node.children!.shift();
    node.children!.unshift(
      element("p", "bso-admonition-title", [
        element("span", "bso-admonition-icon", [], { ariaHidden: "true" }),
        { type: "text", value: marker.title || resolved.labels[type] },
      ]),
    );
    node.data = {
      ...node.data,
      hName: "div",
      hProperties: {
        className: `bso-admonition bso-admonition-${type}`,
      },
    };
  };
}

/** A problem found by {@link admonitionIssues}. */
export interface AdmonitionIssue {
  node: AdmonitionNode;
  rule: "admonition-unknown-type" | "admonition-empty";
  message: string;
}

/** Block quotes with a marker that is mistyped, and admonitions without content. */
export function admonitionIssues(tree: AdmonitionNode): AdmonitionIssue[] {
  const issues: AdmonitionIssue[] = [];
  (function walk(node: AdmonitionNode): void {
    const found = markerOf(node);
    if (found) {
      const { marker, paragraph } = found;
      if (!marker.type) {
        issues.push({
          node,
          rule: "admonition-unknown-type",
          message:
            `'[!${marker.word}]' is not an admonition type, so this block shows as a plain quote. Use one of ${
              ADMONITION_TYPES.map((type) => type.toUpperCase()).join(", ")
            }.`,
        });
      } else if (
        !marker.rest.trim() && (node.children?.length ?? 0) === 1 &&
        paragraph.children?.length === 1
      ) {
        issues.push({
          node,
          rule: "admonition-empty",
          message:
            `The '[!${marker.word}]' block has no content besides its title. Add the text, or remove the block.`,
        });
      }
    }
    for (const child of node.children ?? []) walk(child);
  })(tree);
  return issues;
}
