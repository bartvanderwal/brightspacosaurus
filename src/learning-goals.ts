/**
 * Learning goals that a student can tick off (#167): the list under a heading
 * such as *Learning goals* or *Leerdoelen* becomes a list of square checkboxes.
 * The state is kept by the script in the browser of the student (`localStorage`),
 * nowhere else. Shared by the Brightspace HTML and Docusaurus/MDX, like the flashcards.
 *
 * @module
 */

import { normalizeSectionHeading } from "./flashcards.ts";

/** Optional settings for the learning goals. */
export interface LearningGoalsConfig {
  /**
   * Case-insensitive heading titles whose list becomes checkboxes; a leading
   * number such as `1.` is ignored. Omitted means the defaults; empty turns it off.
   */
  sectionHeadings?: string[];
  /** Language of the progress text. BSO fills it in from `diagrams.locale`. */
  locale?: "nl" | "en";
}

/** Fully resolved options. */
export type ResolvedLearningGoalsConfig = Required<LearningGoalsConfig>;

/** The progress text per locale; `{done}` and `{total}` are filled in by the script. */
export const LEARNING_GOAL_LABELS = {
  nl: { progress: "{done} van {total} afgevinkt" },
  en: { progress: "{done} of {total} checked" },
} as const;

/** Headings recognised when `learningGoals.sectionHeadings` is omitted. */
export const DEFAULT_GOAL_HEADINGS: readonly string[] = [
  "Learning goals",
  "Leerdoelen",
];

/** Validates the options, for BSO's configuration and for direct plugin use. */
export function resolveLearningGoalsOptions(
  value?: unknown,
  defaultLocale: "nl" | "en" = "en",
): ResolvedLearningGoalsConfig {
  const defaults: ResolvedLearningGoalsConfig = {
    sectionHeadings: [...DEFAULT_GOAL_HEADINGS],
    locale: defaultLocale,
  };
  if (value === undefined) return defaults;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Field 'learningGoals' must be an object.");
  }
  const options = value as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (!["sectionHeadings", "locale"].includes(key)) {
      throw new Error(`Unknown configuration field 'learningGoals.${key}'.`);
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
      "Field 'learningGoals.sectionHeadings' must be an array of non-empty strings.",
    );
  }
  if (locale !== undefined && locale !== "nl" && locale !== "en") {
    throw new Error('Field \'learningGoals.locale\' must be "nl" or "en".');
  }
  return {
    sectionHeadings: headings
      ? (headings as string[]).map((heading) => heading.trim())
      : defaults.sectionHeadings,
    locale: locale ?? defaults.locale,
  };
}

/** Minimal Markdown node shape of the transformation. */
export interface GoalNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  children?: GoalNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, string>;
    [key: string]: unknown;
  };
}

function nodeText(node: GoalNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function element(
  tag: string,
  className: string,
  children: GoalNode[],
  properties: Record<string, string> = {},
): GoalNode {
  return {
    type: "bsoGoalElement",
    data: { hName: tag, hProperties: { className, ...properties } },
    children,
  };
}

/** The items of a list as goals, or null when an item does not start with a paragraph. */
function goalItems(list: GoalNode): GoalNode[] | null {
  if (list.type !== "list" || !list.children?.length) return null;
  const items: GoalNode[] = [];
  for (const item of list.children) {
    const first = item.children?.[0];
    if (first?.type !== "paragraph" || !nodeText(first).trim()) return null;
    items.push(
      element("li", "bso-goal", [
        element("label", "bso-goal-label", [
          element("input", "bso-goal-check", [], { type: "checkbox" }),
          element("span", "bso-goal-text", first.children ?? []),
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
export function remarkLearningGoals(
  options?: LearningGoalsConfig,
): (tree: GoalNode) => void {
  const resolved = resolveLearningGoalsOptions(options);
  const headings = new Set(
    resolved.sectionHeadings.map(normalizeSectionHeading),
  );
  const labels = LEARNING_GOAL_LABELS[resolved.locale];
  return function walk(node: GoalNode): void {
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
          const items = goalItems(child);
          if (items) {
            return element("section", "bso-goals", [
              element("ul", "bso-goals-list", items),
            ], { "data-bso-progress-label": labels.progress });
          }
        }
        return child;
      });
    }
    for (const child of node.children ?? []) walk(child);
  };
}
