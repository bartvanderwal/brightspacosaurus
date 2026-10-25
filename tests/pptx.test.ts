import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import JSZip from "jszip";
import { convertDeckToPptx, parseDeck } from "../src/pptx/mod.ts";
import { singleParagraphProperties } from "../src/pptx/renderer.ts";

const images = "examples/demo-course/slides";

const deck = `---
slides: true
title: Demo deck
---

# First slide

Start here.

![bg right:40%](images/dino-whiteboard.jpg)

<!-- _class: lead -->
<!-- Secret teacher note. -->

---

# Second slide

1. One.
2. Two with \`code\` inside.

| Layer | Speed |
| --- | --- |
| Unit | fast |

\`\`\`text
--- not a slide break
\`\`\`
`;

async function entries(bytes: Uint8Array): Promise<JSZip> {
  return await JSZip.loadAsync(bytes);
}

Deno.test("parseDeck splits slides at --- outside code fences and reads the front matter title", () => {
  const parsed = parseDeck(deck);
  assertEquals(parsed.title, "Demo deck");
  assertEquals(parsed.slides.map((slide) => slide.title), [
    "First slide",
    "Second slide",
  ]);
  assertEquals(parsed.slides[1].blocks.map((block) => block.kind), [
    "list",
    "table",
    "code",
  ]);
});

Deno.test("parseDeck keeps comments as notes, but not Marp directives", () => {
  const [first, second] = parseDeck(deck).slides;
  assertEquals(first.notes, ["Secret teacher note."]);
  assertEquals(first.lead, true);
  assertEquals(second.lead, false);
});

Deno.test("parseDeck reads Marp background images", () => {
  const image = parseDeck(deck).slides[0].blocks.find((block) =>
    block.kind === "image"
  );
  assertEquals(image?.kind === "image" && image.background, {
    side: "right",
    share: 0.4,
    contain: false,
  });
  const contain =
    parseDeck("# T\n\n![bg left:30% fit](a.png)\n").slides[0].blocks[0];
  assertEquals(contain.kind === "image" && contain.background, {
    side: "left",
    share: 0.3,
    contain: true,
  });
});

Deno.test("a deck becomes a valid pptx with one slide per Marp slide and the image alt text", async () => {
  const bytes = await convertDeckToPptx(deck, { baseDir: images });
  const zip = await entries(bytes);
  const slides = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name)
  );
  assertEquals(slides.length, 2);
  const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
  assertStringIncludes(first, "First slide");
  assertStringIncludes(first, 'descr="Slide image"');
});

Deno.test("speaker notes stay out of the file unless notes is true", async () => {
  const without = await entries(
    await convertDeckToPptx(deck, { baseDir: images }),
  );
  // pptxgenjs always writes the note parts; they must be empty of our text.
  for (
    const name of Object.keys(without.files).filter((entry) =>
      /notesSlides\/notesSlide\d+\.xml$/.test(entry)
    )
  ) {
    assertEquals(
      (await without.file(name)!.async("string")).includes(
        "Secret teacher note.",
      ),
      false,
    );
  }
  const withNotes = await entries(
    await convertDeckToPptx(deck, { baseDir: images, notes: true }),
  );
  const note = Object.keys(withNotes.files).find((name) =>
    /notesSlides\/notesSlide\d+\.xml$/.test(name)
  );
  assertStringIncludes(
    await withNotes.file(note!)!.async("string"),
    "Secret teacher note.",
  );
});

Deno.test("the same deck and options give identical bytes", async () => {
  const one = await convertDeckToPptx(deck, { baseDir: images, notes: true });
  const two = await convertDeckToPptx(deck, { baseDir: images, notes: true });
  assertEquals(one.length, two.length);
  assertEquals(one.every((byte, index) => byte === two[index]), true);
});

Deno.test("the disclaimer text appears on every slide, and not when it is empty", async () => {
  const shown = await entries(
    await convertDeckToPptx(deck, { baseDir: images, disclaimer: "Preview" }),
  );
  for (const name of ["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]) {
    assertStringIncludes(await shown.file(name)!.async("string"), "Preview");
  }
  const hidden = await entries(
    await convertDeckToPptx(deck, { baseDir: images, disclaimer: "" }),
  );
  assertEquals(
    (await hidden.file("ppt/slides/slide1.xml")!.async("string")).includes(
      ">Preview<",
    ),
    false,
  );
});

Deno.test("a missing or remote image is an error that names the slide", async () => {
  await assertRejects(
    () => convertDeckToPptx("# T\n\n![x](nope.png)\n", { baseDir: images }),
    Error,
    "Slide 1: image not found",
  );
  await assertRejects(
    () =>
      convertDeckToPptx("# T\n\n![x](https://example.org/a.png)\n", {
        baseDir: images,
      }),
    Error,
    "only local images",
  );
});

Deno.test("a paragraph keeps only its first paragraph properties", () => {
  const xml =
    '<a:p><a:pPr marL="1"/><a:r><a:t>a</a:t></a:r><a:pPr indent="0"><a:buNone/></a:pPr><a:r><a:t>b</a:t></a:r></a:p><a:p><a:r><a:t>c</a:t></a:r></a:p>';
  assertEquals(
    singleParagraphProperties(xml),
    '<a:p><a:pPr marL="1"/><a:r><a:t>a</a:t></a:r><a:r><a:t>b</a:t></a:r></a:p><a:p><a:r><a:t>c</a:t></a:r></a:p>',
  );
});

Deno.test("a paragraph property after a part of the paragraph is dropped, a leading one stays", () => {
  assertEquals(
    singleParagraphProperties(
      '<a:p><a:r><a:t>a</a:t></a:r><a:pPr indent="0"><a:buNone/></a:pPr><a:r><a:t>b</a:t></a:r></a:p>',
    ),
    "<a:p><a:r><a:t>a</a:t></a:r><a:r><a:t>b</a:t></a:r></a:p>",
  );
  assertEquals(
    singleParagraphProperties(
      '<a:p><a:pPr marL="1"/><a:r><a:t>a</a:t></a:r><a:br/><a:pPr marL="0"/><a:r><a:t>b</a:t></a:r></a:p>',
    ),
    '<a:p><a:pPr marL="1"/><a:r><a:t>a</a:t></a:r><a:br/><a:r><a:t>b</a:t></a:r></a:p>',
  );
});

Deno.test("a bullet with a link in the middle and a note keep valid paragraphs", async () => {
  const markdown = `---
slides: true
title: Links
---

# Slide

- A reason, no [argument from authority](https://example.org/a): ask on with [five whys](https://example.org/b)
- Some **bold** and \`code\` inside

<!-- A note with *emphasis* and a [link](https://example.org/c). -->
`;
  const zip = await entries(
    await convertDeckToPptx(markdown, { baseDir: images }),
  );
  const parts = Object.keys(zip.files).filter((name) =>
    /^ppt\/(slides|notesSlides)\/[^/]+\.xml$/.test(name)
  );
  assertEquals(parts.length >= 2, true);
  for (const name of parts) {
    const xml = await zip.file(name)!.async("string");
    for (const [, body] of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
      assertEquals(
        (body.match(/<a:pPr\b/g) ?? []).length <= 1,
        true,
        `${name}: more than one pPr in a paragraph`,
      );
      assertEquals(
        /<a:pPr\b/.test(body) && !body.startsWith("<a:pPr"),
        false,
        `${name}: pPr is not the first child`,
      );
    }
  }
  const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
  assertEquals((slide.match(/<a:hlinkClick\b/g) ?? []).length, 2);
  assertStringIncludes(slide, "five whys");
});

Deno.test("the demo decks convert", async () => {
  for (const name of ["slides-fizzbuzz", "slides-test-strategy"]) {
    const markdown = await Deno.readTextFile(`${images}/${name}.md`);
    const zip = await entries(
      await convertDeckToPptx(markdown, { baseDir: images }),
    );
    assertEquals(
      Object.keys(zip.files).some((entry) => entry === "ppt/slides/slide1.xml"),
      true,
    );
  }
});

// Spec *Generated deck pptx*, rule X4: a generated deck carries its images as data URLs.
Deno.test("X4: a data URL image goes into the pptx", async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="red"/></svg>';
  const url = `data:image/svg+xml;base64,${btoa(svg)}`;
  const zip = await entries(
    await convertDeckToPptx(`# Diagram\n\n![A diagram](${url})\n`, {
      baseDir: images,
    }),
  );
  assertEquals(
    Object.keys(zip.files).some((name) => name.startsWith("ppt/media/")),
    true,
  );
});

// Spec *Generated deck pptx*, rule X5: the pptx splits a deck where Marp does.
Deno.test("X5: headingDivider starts a slide at those headings, like Marp, and a heading in code does not", () => {
  const deck = [
    "---",
    "marp: true",
    "headingDivider: 2",
    "---",
    "",
    "# Title",
    "",
    "## Slide 1 - First",
    "",
    "- one",
    "",
    "## Slide 2 - Second",
    "",
    "```md",
    "## not a heading",
    "```",
    "",
    "---",
    "",
    "## Slide 3 - Third",
    "",
    "- three",
  ].join("\n");
  const parsed = parseDeck(deck);
  assertEquals(parsed.slides.length, 4);
  assertEquals(
    parseDeck("---\nmarp: true\n---\n\n## One\n\n- a\n\n## Two\n\n- b\n").slides
      .length,
    1,
  );
  assertEquals(
    parseDeck(
      "---\nmarp: true\nheadingDivider: [2, 3]\n---\n\n## One\n\n### Two\n\n#### Four\n",
    ).slides
      .length,
    2,
  );
});

// Spec *Nested lesson pages*, rule N12: `#<n>` in a link goes to slide n of the same presentation.
Deno.test("N12: a link to #2 in a deck becomes a jump to slide 2, not an external link", async () => {
  const zip = await entries(
    await convertDeckToPptx(
      "# One\n\n- [to two](#2) and [outside](https://example.org)\n\n---\n\n# Two\n",
      { baseDir: images },
    ),
  );
  const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
  const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async(
    "string",
  );
  assertStringIncludes(rels, 'Target="slide2.xml"');
  assertStringIncludes(rels, "https://example.org");
  assertStringIncludes(slide, "hlinkClick");
});

// Spec *Appendices in a generated deck*, rule A6: the pptx counts the appendix slides apart.
Deno.test("A6: appendix slides are not counted with the others and show their footer text", async () => {
  const deck = [
    "# One",
    "",
    "---",
    "",
    "# Two",
    "",
    "---",
    "",
    '<!-- _class: appendix -->\n<!-- _paginate: skip -->\n<!-- _footer: "Bijlage 1/2" -->\n# Appendix A',
    "",
    "---",
    "",
    '<!-- _class: appendix -->\n<!-- _paginate: skip -->\n<!-- _footer: "Bijlage 2/2" -->\n# Appendix B\n\n<!-- A note for the teacher -->',
  ].join("\n");
  const parsed = parseDeck(deck);
  assertEquals(parsed.slides.map((slide) => slide.appendix), [
    false,
    false,
    true,
    true,
  ]);
  assertEquals(parsed.slides[3].footer, "Bijlage 2/2");
  // The directive comments are not speaker notes; a real note stays one.
  assertEquals(parsed.slides[3].notes, ["A note for the teacher"]);
  const zip = await entries(await convertDeckToPptx(deck, { baseDir: images }));
  const texts = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      zip.file(`ppt/slides/slide${n}.xml`)!.async("string")
    ),
  );
  assertStringIncludes(texts[0], "1/2");
  assertStringIncludes(texts[1], "2/2");
  assertStringIncludes(texts[2], "Bijlage 1/2");
  assertStringIncludes(texts[3], "Bijlage 2/2");
  assertEquals(texts[3].includes("4/4"), false);
});
