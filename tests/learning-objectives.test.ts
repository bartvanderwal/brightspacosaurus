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
  LEARNING_OBJECTIVE_LABELS,
  remarkLearningObjectives,
  resolveLearningObjectivesOptions,
} from "../src/learning-objectives.ts";
import type { LearningObjectivesConfig } from "../src/learning-objectives.ts";

// Spec *Learning objectives*, rules LO1-LO6.

async function html(markdown: string, options?: LearningObjectivesConfig) {
  return String(
    await unified().use(remarkParse).use(remarkGfm)
      .use(remarkLearningObjectives, options)
      .use(remarkRehype).use(rehypeStringify).process(markdown),
  );
}

Deno.test("LO1: the list under Learning objectives or Leerdoelen becomes checkboxes, a leading number is ignored", async () => {
  for (
    const heading of ["Learning objectives", "Leerdoelen", "2. Leerdoelen"]
  ) {
    const out = await html(
      `# L\n\n## ${heading}\n\n- First objective\n- Second objective\n`,
    );
    assertEquals(out.match(/<input[^>]*type="checkbox"/g)?.length, 2, heading);
    assertStringIncludes(out, "bso-objectives");
    assertStringIncludes(
      out,
      '<span class="bso-objective-text">First objective</span>',
    );
  }
});

Deno.test("LO2: each checkbox is in a label with the text of the objective, so a screen reader reads it", async () => {
  const out = await html("## Leerdoelen\n\n- Objective **one** with `code`\n");
  assertStringIncludes(out, '<label class="bso-objective-label"><input');
  assertStringIncludes(out, "<strong>one</strong>");
  assertStringIncludes(out, "<code>code</code>");
});

Deno.test("LO3: other lists, other headings and lists after the section stay as they are", async () => {
  const out = await html(
    "## Intro\n\n- plain\n\n## Leerdoelen\n\n- objective\n\n## Next\n\n- also plain\n",
  );
  assertEquals(out.match(/type="checkbox"/g)?.length, 1);
  assertStringIncludes(out, "<li>plain</li>");
  assertStringIncludes(out, "<li>also plain</li>");
});

Deno.test("LO4: a nested list stays in its objective, and a list whose item is not text is left alone", async () => {
  const nested = await html("## Leerdoelen\n\n- Objective\n  - Sub point\n");
  assertEquals(nested.match(/type="checkbox"/g)?.length, 1);
  assertStringIncludes(nested, "Sub point");
  const plain = await html("## Leerdoelen\n\n- ```\n  code\n  ```\n");
  assertEquals(plain.includes("checkbox"), false);
});

Deno.test("LO5: the headings are set by learningObjectives.sectionHeadings, an empty list turns it off, and the progress text follows the language", async () => {
  const custom = await html("## Doelen\n\n- objective\n", {
    sectionHeadings: ["Doelen"],
  });
  assertStringIncludes(custom, "checkbox");
  const off = await html("## Leerdoelen\n\n- objective\n", {
    sectionHeadings: [],
  });
  assertEquals(off.includes("checkbox"), false);
  const nl = await html("## Leerdoelen\n\n- objective\n", { locale: "nl" });
  assertStringIncludes(nl, LEARNING_OBJECTIVE_LABELS.nl.progress);
  const en = await html("## Leerdoelen\n\n- objective\n", { locale: "en" });
  assertStringIncludes(en, LEARNING_OBJECTIVE_LABELS.en.progress);
});

Deno.test("LO6: the options are validated", () => {
  assertEquals(resolveLearningObjectivesOptions().sectionHeadings, [
    "Learning objectives",
    "Leerdoelen",
    "Learning goals",
  ]);
  assertThrows(
    () => resolveLearningObjectivesOptions([]),
    Error,
    "learningObjectives",
  );
  assertThrows(
    () => resolveLearningObjectivesOptions({ sectionHeadings: [""] }),
    Error,
    "sectionHeadings",
  );
  assertThrows(
    () => resolveLearningObjectivesOptions({ locale: "de" }),
    Error,
    "locale",
  );
  assertThrows(
    () => resolveLearningObjectivesOptions({ other: 1 }),
    Error,
    "learningObjectives.other",
  );
  assert(resolveLearningObjectivesOptions({ locale: "nl" }).locale === "nl");
});
