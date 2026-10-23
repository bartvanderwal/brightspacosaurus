import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { generateLessonSlides } from "../src/lesson-slides.ts";

Deno.test("generated lesson slides keep the H1 and H2s but omit prose", () => {
  const result = generateLessonSlides(`# 8.1 Lescontext

Introductory prose that is not a slide.

## 1. Leerdoelen

Aan het einde kun je:

- doel één
- doel twee

## Voorbereiding

Lees dit hoofdstuk eerst.

![Schema](./schema.png)
`);

  assertStringIncludes(result, "# 8.1 Lescontext");
  assertStringIncludes(result, "# 1. Leerdoelen\n\n- doel één\n- doel twee");
  assertStringIncludes(result, "# Voorbereiding\n\n![Schema](./schema.png)");
  assertEquals(result.includes("Introductory prose"), false);
  assertEquals(result.includes("Aan het einde"), false);
  assertEquals(result.includes("Lees dit hoofdstuk"), false);
});

Deno.test("generated lesson slides split long lists and reveal core concepts individually", () => {
  const result = generateLessonSlides(`# Lesson

## Topics

${Array.from({ length: 13 }, (_, index) => `- topic ${index + 1}`).join("\n")}

## 8. Kernbegrippen

- **request:** A message sent by a client.
- **response:** A message sent by a server.
`);
  const slides = result.split("\n\n---\n\n");

  assertEquals(
    slides.filter((slide) => slide.startsWith("# Topics")).length,
    3,
  );
  const glossarySlides = slides.filter((slide) =>
    slide.startsWith("# 8. Kernbegrippen")
  );
  assertEquals(glossarySlides.length, 3);
  assertStringIncludes(glossarySlides[0], "- request\n- response");
  assertStringIncludes(glossarySlides[1], "A message sent by a client.");
  assertStringIncludes(glossarySlides[2], "A message sent by a server.");
  assert(glossarySlides.every((slide) => slide.includes("# 8. Kernbegrippen")));
});

Deno.test("generated lesson slides preserve reference images and their definitions", () => {
  const result = generateLessonSlides(`# Lesson

## Diagram

![Full][schema]

![Collapsed][]

![Shortcut]

[schema]: ./schema.png "Schema"
[Collapsed]: ./collapsed.png
[Shortcut]: ./shortcut.png
`);

  assertStringIncludes(result, "# Diagram\n\n![Full][schema]");
  assertStringIncludes(result, "![Collapsed][]");
  assertStringIncludes(result, "![Shortcut]");
  assertStringIncludes(result, '[schema]: ./schema.png "Schema"');
  assertStringIncludes(result, "[Collapsed]: ./collapsed.png");
  assertStringIncludes(result, "[Shortcut]: ./shortcut.png");
});

Deno.test("generated lesson slides repeat table headers when splitting rows", () => {
  const rows = Array.from(
    { length: 12 },
    (_, index) => `| ${index + 1} | Topic ${index + 1} |`,
  );
  const result = generateLessonSlides(
    `# Lesson\n\n## Schedule\n\n| Week | Topic |\n| --- | --- |\n${
      rows.join("\n")
    }`,
  );
  const tableSlides = result.split("\n\n---\n\n").filter((slide) =>
    slide.startsWith("# Schedule")
  );

  assertEquals(tableSlides.length, 2);
  assertStringIncludes(tableSlides[0], "| Week | Topic |");
  assertStringIncludes(tableSlides[0], "| 10 | Topic 10 |");
  assertStringIncludes(tableSlides[1], "| Week | Topic |");
  assertStringIncludes(tableSlides[1], "| 12 | Topic 12 |");
});

Deno.test("generated lesson slides reject a missing H1", () => {
  assertThrows(
    () => generateLessonSlides("## Topics\n\n- topic"),
    Error,
    "require an H1",
  );
});

Deno.test("generated slides keep diagram fences and code as slides of their own, and drop running text (#140)", () => {
  const result = generateLessonSlides(
    "# Lesson\n\n## Flow\n\nSome running text.\n\n```plantuml\nA -> B\n```\n\n```js\nconsole.log(1)\n```\n\n```mermaid\ngraph TD; A-->B\n```\n",
  );
  assertStringIncludes(result, "```plantuml\nA -> B\n```");
  assertStringIncludes(result, "```mermaid\ngraph TD; A-->B\n```");
  assertStringIncludes(result, "```js\nconsole.log(1)\n```");
  assert(!result.includes("running text"));
  const slides = result.split("\n---\n").filter((s) => s.includes("# Flow"));
  assertEquals(slides.length, 3);
});

Deno.test("a contents slide lists all sections after the title slide, only when asked and with two or more sections", () => {
  const lesson = "# Lesson\n\n## 1. One\n\n- a\n\n## 2. Two\n\n- b\n";
  const withContents = generateLessonSlides(lesson, {
    contentsTitle: "Contents",
  });
  const slides = withContents.split("\n---\n");
  assertStringIncludes(slides[2], "# Contents\n\n- 1\\. One\n- 2\\. Two");
  assertStringIncludes(slides[1], "# Lesson");
  assert(!generateLessonSlides(lesson).includes("# Contents"));
  assert(
    !generateLessonSlides("# Lesson\n\n## Only\n\n- a\n", {
      contentsTitle: "Contents",
    }).includes("# Contents"),
  );
});
