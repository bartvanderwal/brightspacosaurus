import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import {
  LEARNING_GOAL_LABELS,
  remarkLearningGoals,
  resolveLearningGoalsOptions,
} from "../src/learning-goals.ts";
import type { LearningGoalsConfig } from "../src/learning-goals.ts";

// Spec *Learning goals*, rules LG1-LG6 (#167).

async function html(markdown: string, options?: LearningGoalsConfig) {
  return String(
    await unified().use(remarkParse).use(remarkGfm)
      .use(remarkLearningGoals, options)
      .use(remarkRehype).use(rehypeStringify).process(markdown),
  );
}

Deno.test("LG1: the list under Learning goals or Leerdoelen becomes checkboxes, a leading number is ignored", async () => {
  for (const heading of ["Learning goals", "Leerdoelen", "2. Leerdoelen"]) {
    const out = await html(
      `# L\n\n## ${heading}\n\n- First goal\n- Second goal\n`,
    );
    assertEquals(out.match(/<input[^>]*type="checkbox"/g)?.length, 2, heading);
    assertStringIncludes(out, "bso-goals");
    assertStringIncludes(out, '<span class="bso-goal-text">First goal</span>');
  }
});

Deno.test("LG2: each checkbox is in a label with the text of the goal, so a screen reader reads it", async () => {
  const out = await html("## Leerdoelen\n\n- Goal **one** with `code`\n");
  assertStringIncludes(out, '<label class="bso-goal-label"><input');
  assertStringIncludes(out, "<strong>one</strong>");
  assertStringIncludes(out, "<code>code</code>");
});

Deno.test("LG3: other lists, other headings and lists after the section stay as they are", async () => {
  const out = await html(
    "## Intro\n\n- plain\n\n## Leerdoelen\n\n- goal\n\n## Next\n\n- also plain\n",
  );
  assertEquals(out.match(/type="checkbox"/g)?.length, 1);
  assertStringIncludes(out, "<li>plain</li>");
  assertStringIncludes(out, "<li>also plain</li>");
});

Deno.test("LG4: a nested list stays in its goal, and a list whose item is not text is left alone", async () => {
  const nested = await html("## Leerdoelen\n\n- Goal\n  - Sub point\n");
  assertEquals(nested.match(/type="checkbox"/g)?.length, 1);
  assertStringIncludes(nested, "Sub point");
  const plain = await html("## Leerdoelen\n\n- ```\n  code\n  ```\n");
  assertEquals(plain.includes("checkbox"), false);
});

Deno.test("LG5: the headings are set by learningGoals.sectionHeadings, an empty list turns it off, and the progress text follows the language", async () => {
  const custom = await html("## Doelen\n\n- goal\n", {
    sectionHeadings: ["Doelen"],
  });
  assertStringIncludes(custom, "checkbox");
  const off = await html("## Leerdoelen\n\n- goal\n", { sectionHeadings: [] });
  assertEquals(off.includes("checkbox"), false);
  const nl = await html("## Leerdoelen\n\n- goal\n", { locale: "nl" });
  assertStringIncludes(nl, LEARNING_GOAL_LABELS.nl.progress);
  const en = await html("## Leerdoelen\n\n- goal\n", { locale: "en" });
  assertStringIncludes(en, LEARNING_GOAL_LABELS.en.progress);
});

Deno.test("LG6: the options are validated", () => {
  assertEquals(resolveLearningGoalsOptions().sectionHeadings, [
    "Learning goals",
    "Leerdoelen",
  ]);
  assertThrows(() => resolveLearningGoalsOptions([]), Error, "learningGoals");
  assertThrows(
    () => resolveLearningGoalsOptions({ sectionHeadings: [""] }),
    Error,
    "sectionHeadings",
  );
  assertThrows(
    () => resolveLearningGoalsOptions({ locale: "de" }),
    Error,
    "locale",
  );
  assertThrows(
    () => resolveLearningGoalsOptions({ other: 1 }),
    Error,
    "learningGoals.other",
  );
  assert(resolveLearningGoalsOptions({ locale: "nl" }).locale === "nl");
});
