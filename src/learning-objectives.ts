/**
 * Learning objectives that a student can tick off: the list under a heading
 * such as *Learning objectives* or *Leerdoelen* becomes a list of square checkboxes.
 * The state is kept by the script in the browser of the student (`localStorage`),
 * nowhere else. Shared by the Brightspace HTML and Docusaurus/MDX, like the flashcards.
 *
 * @module
 */

import { normalizeSectionHeading } from "./flashcards.ts";

/** Optional settings for the learning objectives. */
export interface LearningObjectivesConfig {
  /**
   * Case-insensitive heading titles whose list becomes checkboxes; a leading
   * number such as `1.` is ignored. Omitted means the defaults; empty turns it off.
   */
  sectionHeadings?: string[];
  /** Language of the progress text. BSO fills it in from `diagrams.locale`. */
  locale?: "nl" | "en";
}

/** Fully resolved options. */
export type ResolvedLearningObjectivesConfig = Required<
  LearningObjectivesConfig
>;

/** The progress text per locale; `{done}` and `{total}` are filled in by the script. */
export const LEARNING_OBJECTIVE_LABELS = {
  nl: { progress: "{done} van {total} afgevinkt" },
  en: { progress: "{done} of {total} checked" },
} as const;

/** Headings recognised when `learningObjectives.sectionHeadings` is omitted. */
export const DEFAULT_OBJECTIVE_HEADINGS: readonly string[] = [
  "Learning objectives",
  "Leerdoelen",
  // The word many authors use for what is an objective (Software Guidebook, 2.5).
  "Learning goals",
];

/** Validates the options, for BSO's configuration and for direct plugin use. */
export function resolveLearningObjectivesOptions(
  value?: unknown,
  defaultLocale: "nl" | "en" = "en",
): ResolvedLearningObjectivesConfig {
  const defaults: ResolvedLearningObjectivesConfig = {
    sectionHeadings: [...DEFAULT_OBJECTIVE_HEADINGS],
    locale: defaultLocale,
  };
  if (value === undefined) return defaults;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Field 'learningObjectives' must be an object.");
  }
  const options = value as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (!["sectionHeadings", "locale"].includes(key)) {
      throw new Error(
        `Unknown configuration field 'learningObjectives.${key}'.`,
      );
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
      "Field 'learningObjectives.sectionHeadings' must be an array of non-empty strings.",
    );
  }
  if (locale !== undefined && locale !== "nl" && locale !== "en") {
    throw new Error(
      'Field \'learningObjectives.locale\' must be "nl" or "en".',
    );
  }
  return {
    sectionHeadings: headings
      ? (headings as string[]).map((heading) => heading.trim())
      : defaults.sectionHeadings,
    locale: locale ?? defaults.locale,
  };
}

/** Minimal Markdown node shape of the transformation. */
export interface ObjectiveNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  children?: ObjectiveNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, string>;
    [key: string]: unknown;
  };
}

function nodeText(node: ObjectiveNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function element(
  tag: string,
  className: string,
  children: ObjectiveNode[],
  properties: Record<string, string> = {},
): ObjectiveNode {
  return {
    type: "bsoObjectiveElement",
    data: { hName: tag, hProperties: { className, ...properties } },
    children,
  };
}

/** The items of a list as objectives, or null when an item does not start with a paragraph. */
function objectiveItems(list: ObjectiveNode): ObjectiveNode[] | null {
  if (list.type !== "list" || !list.children?.length) return null;
  const items: ObjectiveNode[] = [];
  for (const item of list.children) {
    const first = item.children?.[0];
    if (first?.type !== "paragraph" || !nodeText(first).trim()) return null;
    items.push(
      element("li", "bso-objective", [
        element("label", "bso-objective-label", [
          element("input", "bso-objective-check", [], { type: "checkbox" }),
          element("span", "bso-objective-text", first.children ?? []),
        ]),
        ...item.children!.slice(1),
      ]),
    );
  }
  return items;
}

/**
 * Turns the lists under the configured headings into checkbox lists, without
 * raw HTML, so Docusaurus/MDX and remark-rehype both honour it. Without script
 * the boxes still work but remember nothing, and the text stays readable.
 */
export function remarkLearningObjectives(
  options?: LearningObjectivesConfig,
): (tree: ObjectiveNode) => void {
  const resolved = resolveLearningObjectivesOptions(options);
  const headings = new Set(
    resolved.sectionHeadings.map(normalizeSectionHeading),
  );
  const labels = LEARNING_OBJECTIVE_LABELS[resolved.locale];
  return function walk(node: ObjectiveNode): void {
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
        if (sectionDepth !== undefined) {
          const items = objectiveItems(child);
          if (items) {
            return element("section", "bso-objectives", [
              element("ul", "bso-objectives-list", items),
            ], { "data-bso-progress-label": labels.progress });
          }
        }
        return child;
      });
    }
    for (const child of node.children ?? []) walk(child);
  };
}
