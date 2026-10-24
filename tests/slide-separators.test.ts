import { assertEquals } from "@std/assert";
import {
  dropEmptySlideSeparators,
  findEmptySlideSeparators,
  headingDividerLevels,
} from "../src/slide-separators.ts";
import { lintMarkdown } from "../src/course-linter.ts";

Deno.test("headingDividerLevels reads a number or a list", () => {
  assertEquals(headingDividerLevels("marp: true\nheadingDivider: 2\n"), [1, 2]);
  assertEquals(headingDividerLevels("headingDivider: [2, 3]"), [2, 3]);
  assertEquals(headingDividerLevels("marp: true"), []);
  assertEquals(headingDividerLevels("headingDivider: x"), []);
});

Deno.test("only a separator that gives an empty slide is found", () => {
  const body = [
    "---", // 0: opens the slide deck
    "# A",
    "text",
    "---", // 3: splits one section, content follows: fine
    "more text",
    "---", // 5: directly before a divider heading
    "<!-- note -->",
    "## B",
    "```",
    "---", // inside code: ignored
    "```",
    "---", // 11: double separator
    "---", // 12: ends the body
  ].join("\n");
  assertEquals(findEmptySlideSeparators(body, [1, 2]), [0, 5, 11, 12]);
  assertEquals(findEmptySlideSeparators(body, []), [0, 11, 12]);
  assertEquals(findEmptySlideSeparators("# A\n\n---\n\n### C\n", [1, 2]), []);
});

Deno.test("dropEmptySlideSeparators keeps separators that split a section", () => {
  assertEquals(
    dropEmptySlideSeparators("# A\n\ntext\n\n---\n\n# B\n\n- x\n\n---\n\n- y", [
      1,
    ]),
    "# A\n\ntext\n\n\n# B\n\n- x\n\n---\n\n- y",
  );
  assertEquals(dropEmptySlideSeparators("a\n---\nb", [1]), "a\n---\nb");
});

Deno.test("bso lint warns about empty slide separators in slide decks only", () => {
  const deck =
    "---\nslides: true\nheadingDivider: 2\n---\n\n# T\n\ntext\n\n---\n\n## S\n\nx\n";
  const found = lintMarkdown(deck, "deck.md").filter((d) =>
    d.rule === "slides-empty-separator"
  );
  assertEquals(found.map((d) => [d.line, d.severity]), [[10, "warning"]]);
  const lesson = "# Lesson\n\ntext\n\n---\n\n## S\n";
  assertEquals(
    lintMarkdown(lesson, "lesson.md").filter((d) =>
      d.rule === "slides-empty-separator"
    ),
    [],
  );
});

Deno.test("a slide deck's Marp front matter is not a lesson-frontmatter warning", () => {
  const deck = "---\nslides: true\nheadingDivider: 2\n---\n\n# T\n\n## S\n";
  assertEquals(
    lintMarkdown(deck, "deck.md", { lessonFile: true }).filter((d) =>
      d.rule === "lesson-frontmatter"
    ),
    [],
  );
});
