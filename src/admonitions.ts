/**
 * Callout blocks written as container directives (`:::optional` ... `:::`),
 * shared by the Brightspace HTML and Docusaurus/MDX like the flashcards. The
 * block gets the same HTML and the same stylesheet in both.
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

/** Directive names of other BSO features, which are not admonitions. */
export const OTHER_DIRECTIVES: readonly string[] = ["flashcards", "flashcard"];

/** Types that fold open and shut, and whether they start open (spec *Admonitions*, AD2). */
const COLLAPSIBLE: Partial<Record<AdmonitionType, { open: boolean }>> = {
  note: { open: true },
  optional: { open: false },
};

/** The part of a Markdown syntax tree that this module reads and writes. */
export interface AdmonitionNode {
  type: string;
  name?: string;
  value?: string;
  children?: AdmonitionNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
    directiveLabel?: boolean;
  };
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

/** Whether a directive name is one of the admonition types. */
export function isAdmonitionType(
  name: string | undefined,
): name is AdmonitionType {
  return (ADMONITION_TYPES as readonly string[]).includes(name ?? "");
}

/** `:::type[Title]`: the label is the first child, a paragraph marked by remark-directive. */
function hasLabel(node: AdmonitionNode): boolean {
  const first = node.children?.[0];
  return first?.type === "paragraph" && first.data?.directiveLabel === true;
}

/**
 * Turn `:::TYPE` container directives into admonition elements, without raw
 * HTML: remark-rehype and Docusaurus/MDX both honor the hName/hProperties
 * fields. `note` and `optional` become a native `<details>` element.
 */
export function remarkAdmonitions(
  options?: AdmonitionsConfig,
): (tree: AdmonitionNode) => void {
  const resolved = resolveAdmonitionsOptions(options);
  return function walk(node: AdmonitionNode): void {
    for (const child of node.children ?? []) walk(child);
    if (node.type !== "containerDirective" || !isAdmonitionType(node.name)) {
      return;
    }
    const type = node.name;
    const children = node.children ?? [];
    const title: AdmonitionNode[] = hasLabel(node)
      ? children[0].children ?? []
      : [{ type: "text", value: resolved.labels[type] }];
    const content = hasLabel(node) ? children.slice(1) : children;
    const collapsible = COLLAPSIBLE[type];
    node.children = [
      element(collapsible ? "summary" : "p", "bso-admonition-title", [
        element("span", "bso-admonition-icon", [], { ariaHidden: "true" }),
        ...title,
      ]),
      ...content,
    ];
    node.data = {
      ...node.data,
      hName: collapsible ? "details" : "div",
      hProperties: {
        className: `bso-admonition bso-admonition-${type}`,
        ...(collapsible?.open ? { open: true } : {}),
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

/** Container directives with a name that is not an admonition type, and admonitions without content. */
export function admonitionIssues(tree: AdmonitionNode): AdmonitionIssue[] {
  const issues: AdmonitionIssue[] = [];
  (function walk(node: AdmonitionNode): void {
    if (node.type === "containerDirective" && node.name) {
      if (isAdmonitionType(node.name)) {
        const content = (node.children ?? []).slice(hasLabel(node) ? 1 : 0);
        if (content.length === 0) {
          issues.push({
            node,
            rule: "admonition-empty",
            message:
              `The ':::${node.name}' block has no content besides its title. Add the text, or remove the block.`,
          });
        }
      } else if (!OTHER_DIRECTIVES.includes(node.name)) {
        issues.push({
          node,
          rule: "admonition-unknown-type",
          message:
            `':::${node.name}' is not an admonition type, so this block does not look the same in Brightspace. Use one of ${
              ADMONITION_TYPES.map((type) => `:::${type}`).join(", ")
            }.`,
        });
      }
    }
    for (const child of node.children ?? []) walk(child);
  })(tree);
  return issues;
}
