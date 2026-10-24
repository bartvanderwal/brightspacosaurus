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

Deno.test("generated slides keep diagram fences and code as slides of their own, and drop running text", () => {
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

Deno.test("a linked slide deck is inserted after the section with the link and listed in the contents slide", () => {
  const lesson = [
    "# Lesson",
    "",
    "## 1. One",
    "",
    "- a",
    "",
    "[Extra: depth](deck-a.md)",
    "",
    "## 2. Two",
    "",
    "- b",
    "",
    "[Again](deck-a.md) and [Other](plain.md)",
  ].join("\n");
  const deck = {
    id: "/d/deck-a.md",
    title: "Depth",
    markdown: "# Depth slide\n\nMore.",
  };
  const result = generateLessonSlides(lesson, {
    contentsTitle: "Contents",
    linkedDeck: (url) => url === "deck-a.md" ? deck : undefined,
  });
  const slides = result.split("\n\n---\n\n");
  const titles = slides.map((slide) =>
    slide.split("\n").find((line) => line.startsWith("# "))
  );
  // title, contents, section 1, the slide deck right after it, section 2 (once only)
  assertEquals(titles.slice(0, 5), [
    "# Lesson",
    "# Contents",
    "# 1. One",
    "# Depth slide",
    "# 2. Two",
  ]);
  assertEquals(
    slides.filter((slide) => slide.includes("# Depth slide")).length,
    1,
  );
  assertStringIncludes(slides[1], "- 1\\. One\n- Depth\n- 2\\. Two");
});

Deno.test("a slide deck linked before the first section follows the contents slide", () => {
  const lesson =
    "# Lesson\n\n[Intro deck](intro.md)\n\n## 1. One\n\n- a\n\n## 2. Two\n\n- b\n";
  const result = generateLessonSlides(lesson, {
    contentsTitle: "Contents",
    linkedDeck: () => ({ id: "i", title: "Intro", markdown: "# Intro slide" }),
  });
  const slides = result.split("\n\n---\n\n");
  assertStringIncludes(slides[1], "- Intro\n- 1\\. One");
  assertStringIncludes(slides[2], "# Intro slide");
  assertStringIncludes(slides[3], "# 1. One");
});

// Spec *Generated slides: what a section gives*, rules G1-G7.
function slidesOf(lesson: string, options = {}): string[] {
  return generateLessonSlides(lesson, { contentsTitle: "Contents", ...options })
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .split("\n\n---\n\n");
}
const headingOf = (slide: string) =>
  slide.split("\n").find((line) => line.startsWith("# "));

Deno.test("G4: a section with only running text gets no slide and no contents entry", () => {
  const lesson = [
    "# Lesson",
    "",
    "## 1. One",
    "",
    "- a",
    "",
    "## 2. Only prose",
    "",
    "Just a paragraph of running text.",
    "",
    "## 3. Three",
    "",
    "- c",
  ].join("\n");
  const slides = slidesOf(lesson);
  assertEquals(slides.map(headingOf), [
    "# Lesson",
    "# Contents",
    "# 1. One",
    "# 3. Three",
  ]);
  assertStringIncludes(slides[1], "- 1\\. One\n- 3\\. Three");
  assert(!slides.join("\n").includes("Only prose"));
  assert(!slides.join("\n").includes("running text"));
});

Deno.test("G4: a linked slide deck in a section without content is still inserted and listed", () => {
  const lesson = [
    "# Lesson",
    "",
    "## 1. One",
    "",
    "- a",
    "",
    "## 2. Only a link",
    "",
    "See [the deck](deck.md).",
    "",
    "## 3. Three",
    "",
    "- c",
  ].join("\n");
  const slides = slidesOf(lesson, {
    linkedDeck: () => ({
      id: "d",
      title: "The deck",
      markdown: "# Deck slide",
    }),
  });
  assertEquals(slides.map(headingOf), [
    "# Lesson",
    "# Contents",
    "# 1. One",
    "# Deck slide",
    "# 3. Three",
  ]);
  assertStringIncludes(slides[1], "- 1\\. One\n- The deck\n- 3\\. Three");
});

Deno.test("G2: no contents slide when fewer than two sections have content", () => {
  const lesson = "# Lesson\n\n## 1. One\n\n- a\n\n## 2. Only prose\n\nText.\n";
  assertEquals(slidesOf(lesson).map(headingOf), ["# Lesson", "# 1. One"]);
});

Deno.test("G3: lists, tables, images, code and diagrams are on the slides; running text is not", () => {
  const lesson = [
    "# Lesson",
    "",
    "## 1. All",
    "",
    "Running text.",
    "",
    "- item",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "![pic](pic.png)",
    "",
    "```js",
    "code()",
    "```",
    "",
    "```plantuml",
    "A -> B",
    "```",
  ].join("\n");
  const all = slidesOf(lesson).join("\n");
  for (
    const wanted of [
      "- item",
      "| 1 | 2 |",
      "![pic](pic.png)",
      "code()",
      "A -> B",
    ]
  ) {
    assertStringIncludes(all, wanted);
  }
  assert(!all.includes("Running text."));
});

Deno.test("G6: long lists continue under the same heading", () => {
  const items = Array.from({ length: 13 }, (_, i) => `- item ${i + 1}`).join(
    "\n",
  );
  const slides = slidesOf(`# Lesson\n\n## 1. Long\n\n${items}\n`);
  const own = slides.filter((slide) => headingOf(slide) === "# 1. Long");
  assertEquals(own.length, 3);
  assertStringIncludes(own[2], "- item 13");
});

// Spec *Nested lesson pages*, rules N1-N6.
const levelPage = (title: string, extra = "") =>
  `# ${title}\n\n## 1. Goal\n\n- fast${extra}\n\n## 2. Scope\n\n- small\n`;
const pages: Record<string, { id: string; source: string }> = {
  "levels/unit.md": { id: "unit", source: levelPage("Unit tests") },
  "levels/integration.md": {
    id: "integration",
    source: levelPage("Integration tests", "\n\n[Unit again](unit.md)"),
  },
};
const overview = [
  "# Overview",
  "",
  "## 1. Why",
  "",
  "- a",
  "",
  "## 2. The levels",
  "",
  "- [Unit](levels/unit.md)",
  "- [Integration](levels/integration.md)",
  "- [Other](other.md)",
  "",
  "## 3. Choose",
  "",
  "- c",
].join("\n");

Deno.test("N1/N3/N5: nested pages come after the section with the link, as a divider with a sub-number and their own sections", () => {
  const slides = slidesOf(overview, {
    nestedPage: (url: string) => pages[url],
  });
  assertEquals(slides.map(headingOf), [
    "# Overview",
    "# Contents",
    "# 1. Why",
    "# 2. The levels",
    "# 2.1 Unit tests",
    "# 1. Goal",
    "# 2. Scope",
    "# 2.2 Integration tests",
    "# 1. Goal",
    "# 2. Scope",
    "# 3. Choose",
  ]);
  // an ordinary link stays an ordinary link
  assertStringIncludes(slides[3], "[Other](other.md)");
  assert(!slides.join("\n").includes("Unit again\n\n# 2.1"));
});

Deno.test("N6: the contents slide lists the nested pages with their numbers under their section", () => {
  const slides = slidesOf(overview, {
    nestedPage: (url: string) => pages[url],
  });
  assertStringIncludes(
    slides[1],
    "- 1\\. Why\n- 2\\. The levels\n  - 2.1 Unit tests\n  - 2.2 Integration tests\n- 3\\. Choose",
  );
});

Deno.test("N2: a page linked twice is nested once, and the links of a nested page are not followed (N4)", () => {
  const twice = overview.replace(
    "- [Other](other.md)",
    "- [Unit once more](levels/unit.md)",
  );
  const slides = slidesOf(twice, { nestedPage: (url: string) => pages[url] });
  assertEquals(
    slides.filter((slide) => headingOf(slide) === "# 2.1 Unit tests").length,
    1,
  );
  // the integration page links the unit page: it is not nested a second time
  assertEquals(
    slides.filter((slide) => headingOf(slide)?.endsWith("Unit tests")).length,
    1,
  );
});

Deno.test("N5: a section without a number gives no sub-numbers, and a section 2.1 gives 2.1.k", () => {
  const plain = overview.replace("## 2. The levels", "## The levels");
  const titles = slidesOf(plain, { nestedPage: (url: string) => pages[url] })
    .map(headingOf);
  assert(titles.includes("# Unit tests"));
  assert(titles.includes("# Integration tests"));
  const sub = overview.replace("## 2. The levels", "## 2.1 The levels");
  assert(
    slidesOf(sub, { nestedPage: (url: string) => pages[url] }).map(headingOf)
      .includes("# 2.1.1 Unit tests"),
  );
});
