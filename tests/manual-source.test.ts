import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildFeatureChapter,
  flashcardsForPrint,
  loadFeaturePages,
  shiftHeadings,
  splitManualTitleBlock,
  stripFrontMatter,
} from "../src/manual-source.ts";

Deno.test("stripFrontMatter removes only a leading block", () => {
  assertEquals(
    stripFrontMatter("---\nsidebar_position: 1\n---\n# T\n"),
    "# T\n",
  );
  assertEquals(
    stripFrontMatter("# T\n\n---\nx\n---\n"),
    "# T\n\n---\nx\n---\n",
  );
});

Deno.test("shiftHeadings moves headings down but not inside code fences", () => {
  const source =
    "# One\n\n```bash\n# comment\n```\n\n## Two\n\n````md\n```\n# nested\n```\n````\n";
  const shifted = shiftHeadings(source, 2);
  assertStringIncludes(shifted, "### One");
  assertStringIncludes(shifted, "#### Two");
  assertStringIncludes(shifted, "# comment");
  assertStringIncludes(shifted, "# nested");
  assertEquals(shifted.includes("### comment"), false);
});

Deno.test("shiftHeadings never goes below level 6", () => {
  assertEquals(shiftHeadings("###### Deep", 3), "###### Deep");
});

Deno.test("buildFeatureChapter orders pages like the online menu", () => {
  const chapter = buildFeatureChapter([
    { name: "b.md", markdown: "---\nsidebar_position: 2\n---\n# Second\n" },
    { name: "index.md", markdown: "# Features\n\nIntro.\n" },
    {
      name: "a.md",
      markdown: "---\nsidebar_position: 1\n---\n# First\n\n## Part\n",
    },
    { name: "c.md", markdown: "# Unpositioned\n" },
  ]);
  assertEquals(
    chapter.match(/^#+ .*/gm),
    ["## Features", "### First", "#### Part", "### Second", "### Unpositioned"],
  );
});

Deno.test("buildFeatureChapter without pages gives an empty chapter", () => {
  assertEquals(buildFeatureChapter([]), "");
});

Deno.test({
  name: "loadFeaturePages reads Markdown files and tolerates a missing folder",
  permissions: { read: true, write: true },
  async fn() {
    assertEquals(await loadFeaturePages("/does/not/exist/features"), []);
    const dir = await Deno.makeTempDir({ prefix: "manual_source_" });
    try {
      await Deno.writeTextFile(`${dir}/a.md`, "# A\n");
      await Deno.writeTextFile(`${dir}/skip.txt`, "no");
      const pages = await loadFeaturePages(dir);
      assertEquals(pages.map((page) => page.name), ["a.md"]);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test("flashcardsForPrint turns cards into bold terms and keeps code literal", () => {
  const source =
    "::::flashcards\n\n:::flashcard\nterm: Idempotent\n\nSame output.\n:::\n\n::::\n\n````markdown\n:::flashcard\nterm: Example\n:::\n````\n";
  const printed = flashcardsForPrint(source);
  assertStringIncludes(printed, "**Idempotent**\n\nSame output.");
  assertEquals(
    printed.split("\n").filter((line) => line.trim() === ":::flashcards")
      .length,
    0,
  );
  assertStringIncludes(
    printed,
    "````markdown\n:::flashcard\nterm: Example\n:::\n````",
  );
});

Deno.test("splitManualTitleBlock takes title, author and version off the PDF body (#53)", () => {
  const block = splitManualTitleBlock(
    "# My Manual\n\nA subtitle\n\n- *Author(s)*: A. Writer\n- *Version*: 1.0\n\n## 1. Intro\n\ntext\n",
  );
  assertEquals(block.title, "My Manual");
  assertEquals(block.subtitle, "A subtitle");
  assertEquals(block.author, "A. Writer");
  assertEquals(block.version, "1.0");
  assertEquals(block.body, "## 1. Intro\n\ntext\n");
  const plain = splitManualTitleBlock("no heading\n\n## One\n");
  assertEquals(plain.title, undefined);
  assertEquals(plain.body, "no heading\n\n## One\n");
  assertEquals(splitManualTitleBlock("# Only title\n").body, "");
});
