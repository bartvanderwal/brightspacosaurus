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
