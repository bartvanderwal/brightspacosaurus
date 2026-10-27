import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  dropLooseDeckTitle,
  generateLessonSlides,
  stripTitlePrefix,
} from "../src/lesson-slides.ts";

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

Deno.test("G6: long lists continue under the same heading with a counter", () => {
  const items = Array.from({ length: 13 }, (_, i) => `- item ${i + 1}`).join(
    "\n",
  );
  const slides = slidesOf(`# Lesson\n\n## 1. Long\n\n${items}\n`);
  const own = slides.filter((slide) =>
    headingOf(slide)?.startsWith("# 1. Long")
  );
  assertEquals(own.map(headingOf), [
    "# 1. Long (1/3)",
    "# 1. Long (2/3)",
    "# 1. Long (3/3)",
  ]);
  assertStringIncludes(own[2], "- item 13");
  // A section with one slide has no counter.
  const single = slidesOf("# Lesson\n\n## 1. Short\n\n- one\n- two\n");
  assertEquals(single.some((slide) => headingOf(slide) === "# 1. Short"), true);
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

// Spec *Generated slides*, rule G1, and *Nested lesson pages*, rules N3 and N12.
Deno.test("G1/N3: the images under an H1 stand on the title slide and on the divider slide of a nested page", () => {
  const slides = generateLessonSlides(
    "# Overview\n\n![Cover](cover.png)\n\nSome words.\n\n## 1. Pages\n\n- [Unit](levels/unit.md)\n",
    {
      nestedPage: (url) =>
        url === "levels/unit.md"
          ? {
            id: "unit",
            source:
              "# Unit tests\n\n![Unit picture](unit.png)\n\n## 1. Fast\n\n- quick\n",
          }
          : undefined,
    },
  );
  assertStringIncludes(
    slides,
    "# Overview\n\n![Cover](cover.png)\n\n<!-- _class: lead -->",
  );
  assertStringIncludes(
    slides,
    "# 1.1 Unit tests\n\n![Unit picture](unit.png)\n\n<!-- _class: lead -->",
  );
});

Deno.test("N12: links to nested pages and to headings of the deck point at slides of the deck", () => {
  const pages: Record<string, string> = {
    "levels/unit.md":
      "# Unit tests\n\n## 1. Fast\n\n- quick, see [integration](../levels/integration.md#2-slower)\n",
    "levels/integration.md": "# Integration tests\n\n## 2. Slower\n\n- slow\n",
  };
  const slides = generateLessonSlides(
    [
      "# Overview",
      "",
      "## 1. Pages",
      "",
      "- [Unit](levels/unit.md)",
      "- [Integration](levels/integration.md)",
      "",
      "## 2. Back",
      "",
      "- [unit again](levels/unit.md), [the pages](#1-pages), [outside](https://example.org/x.md), [unknown](#nowhere)",
      "",
    ].join("\n"),
    {
      contentsTitle: "Contents",
      nestedPage: (url) => {
        const path = url.split("#")[0].replace(/^\.\.\//, "");
        return pages[path] ? { id: path, source: pages[path] } : undefined;
      },
    },
  );
  const parts = slides.split("\n\n---\n\n");
  // Title (with the front matter), contents, "1. Pages", unit divider, "1. Fast", integration divider, "2. Slower", "2. Back".
  assertEquals(parts.length, 8);
  const back = parts[parts.length - 1];
  assertStringIncludes(back, "[unit again](#4)");
  assertStringIncludes(back, "[the pages](#3)");
  assertStringIncludes(back, "[outside](https://example.org/x.md)");
  assertStringIncludes(back, "[unknown](#nowhere)");
  // A link from a nested page to a heading of another nested page.
  assertStringIncludes(slides, "[integration](#7)");
});

// Spec *Generated slides*, rule G6: a table counts the wrapped lines of its long cells.
Deno.test("G6: a table with long cells continues on more slides than one with short cells", () => {
  const long = "x".repeat(100);
  const table = (cell: string) =>
    [
      "| A | B | C |",
      "| --- | --- | --- |",
      ...Array.from({ length: 7 }, (_, i) => `| ${cell}${i} | b | c |`),
    ].join("\n");
  const slidesOf7 = (cell: string) =>
    generateLessonSlides(`# L\n\n## 1. T\n\n${table(cell)}\n`).split(
      "\n\n---\n\n",
    ).filter((slide) => slide.includes("| A | B | C |")).length;
  assertEquals(slidesOf7("short"), 1);
  assertEquals(slidesOf7(long) > 1, true);
  // The header line is repeated on each continuation slide.
  const parts = generateLessonSlides(`# L\n\n## 1. T\n\n${table(long)}\n`)
    .split(
      "\n\n---\n\n",
    ).filter((slide) => slide.includes("| A | B | C |"));
  for (const part of parts) assertStringIncludes(part, "| --- | --- | --- |");
});

// Spec *Appendices in a generated deck*, rules A1-A5.
const withAppendices = [
  "# Lesson",
  "",
  "## 1. Intro",
  "",
  "- one",
  "",
  "## 2. Context",
  "",
  "- two",
  "",
  "## Bijlagen",
  "",
  "- [Page](pages/a.md)",
  "",
  "## Bijlage B: Extra",
  "",
  "- extra",
  "",
].join("\n");
const pageA = { id: "a", source: "# Page A\n\n## 1. Part\n\n- part\n" };

Deno.test("A1-A3: the slides from the first appendix section on are appendix slides with their own count and a contents entry", () => {
  const deck = generateLessonSlides(withAppendices, {
    contentsTitle: "Inhoudsopgave",
    nestedPage: (url) => url === "pages/a.md" ? pageA : undefined,
  });
  const parts = deck.split("\n\n---\n\n");
  // Title, contents, 1. Intro, 2. Context, then Bijlagen, Page A divider, Page A part, Bijlage B.
  assertEquals(parts.length, 8);
  // The appendices are one entry in the contents slide, with their own range.
  assertStringIncludes(parts[1], "- Bijlagen (B1 t/m B4)");
  assertEquals(parts[1].includes("Bijlage B: Extra"), false);
  // The normal slides carry no appendix marks.
  for (const part of parts.slice(1, 4)) {
    assertEquals(part.includes("appendix"), false);
  }
  assertEquals(parts[0].includes("_class: appendix"), false);
  // The appendix slides do not count in the page numbering and name themselves in the footer.
  for (const [index, part] of parts.slice(4).entries()) {
    assertStringIncludes(part, "<!-- _paginate: skip -->");
    assertStringIncludes(part, `<!-- _footer: "Bijlage ${index + 1}/4" -->`);
    assertStringIncludes(part, "appendix -->");
  }
  assertStringIncludes(deck, "<style>section.appendix footer");
});

Deno.test("A4: the words of the appendices follow the language", () => {
  const deck = generateLessonSlides(
    withAppendices.replace("Bijlage", "Appendix").replace(
      "Bijlagen",
      "Appendices",
    ),
    { contentsTitle: "Contents", locale: "en" },
  );
  assertStringIncludes(deck, "- Appendices (A1 to A");
  assertStringIncludes(deck, '<!-- _footer: "Appendix 1/');
});

Deno.test("A5: a deck without appendix has no appendix marks and no style", () => {
  const deck = generateLessonSlides(
    "# L\n\n## 1. A\n\n- a\n\n## 2. B\n\n- b\n",
    {
      contentsTitle: "Contents",
    },
  );
  assertEquals(deck.includes("appendix"), false);
  assertEquals(deck.includes("<style>"), false);
});

// Spec *Appendices in a generated deck*, rule A7.
Deno.test("A7: the directives of a slide come after its heading, so that headingDivider adds no empty slide", () => {
  const deck = generateLessonSlides(withAppendices, {
    contentsTitle: "Inhoudsopgave",
    nestedPage: (url) => url === "pages/a.md" ? pageA : undefined,
  });
  for (const slide of deck.split("\n\n---\n\n")) {
    // No slide starts with a comment: a comment before a heading that headingDivider
    // splits at would be a slide of its own.
    const body = slide.replace(
      /^---[\s\S]*?\n---\n\n(<style>.*<\/style>\n\n)?/,
      "",
    );
    assertEquals(/^<!--/.test(body), false, body.slice(0, 60));
  }
});

// Spec *Title prefix*, rules TP1-TP3.
Deno.test("TP1: the start of a title that the pattern matches is left out, at every heading level", () => {
  const source =
    "## Slide 3 - Standup\n\n# Slide 12 - Closing\n\n### Slide 4 - Detail\n";
  assertEquals(
    stripTitlePrefix(source, "Slide \\d+ - "),
    "## Standup\n\n# Closing\n\n### Detail\n",
  );
});

Deno.test("TP2: only headings outside code fences, and only at the start of the title", () => {
  const source =
    "## Intro on Slide 3 - not a prefix\n\n```md\n## Slide 3 - in code\n```\n\nSlide 3 - plain text\n";
  assertEquals(stripTitlePrefix(source, "Slide \\d+ - "), source);
});

Deno.test("TP3: a title that is only the prefix is left as it is", () => {
  assertEquals(
    stripTitlePrefix("## Slide 3 -\n", "Slide \\d+ -"),
    "## Slide 3 -\n",
  );
});

// Spec *Title of a deck*, rules DT1-DT3.
Deno.test("DT1: a lone # title directly before the first ## of a deck with headingDivider is not a slide", () => {
  const deck =
    "---\nslides: true\nheadingDivider: 2\ntitle: Les\n---\n\n# Slides les 8.3\n\n## Standup\n\n- a\n";
  assertEquals(
    dropLooseDeckTitle(deck),
    "---\nslides: true\nheadingDivider: 2\ntitle: Les\n---\n## Standup\n\n- a\n",
  );
});

Deno.test("DT2: a deck without headingDivider, or with more than the title before the first ##, is left as it is", () => {
  const plain = "---\nslides: true\n---\n\n# Title\n\n## One\n";
  assertEquals(dropLooseDeckTitle(plain), plain);
  const more =
    "---\nslides: true\nheadingDivider: 2\n---\n\n# Title\n\nA subtitle.\n\n## One\n";
  assertEquals(dropLooseDeckTitle(more), more);
  const directive =
    "---\nslides: true\nheadingDivider: 2\n---\n\n<!-- _class: lead -->\n\n# Title\n\n## One\n";
  assertEquals(dropLooseDeckTitle(directive), directive);
});
