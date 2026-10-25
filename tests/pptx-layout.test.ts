import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import JSZip from "jszip";
import type { PptxBlock, PptxDeck } from "../src/pptx/deck-parser.ts";
import { renderDeck } from "../src/pptx/renderer.ts";
import { slideNumbers } from "../src/slide-numbering.ts";

const options = { baseDir: Deno.cwd(), notes: true };

function deck(blocks: PptxBlock[]): PptxDeck {
  return {
    title: "Layout",
    slides: [{
      title: "Content",
      lead: false,
      notes: ["Preserved speaker note."],
      blocks,
    }],
  };
}

async function slides(zip: JSZip): Promise<string[]> {
  const names = Object.keys(zip.files).filter((name) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(name)
  ).sort((a, b) =>
    Number(a.match(/(\d+)\.xml$/)![1]) -
    Number(b.match(/(\d+)\.xml$/)![1])
  );
  return await Promise.all(names.map((name) => zip.file(name)!.async("string")));
}

function assertFits(xml: string) {
  for (const [, x, y, w, h] of xml.matchAll(
    /<(?:a|p):xfrm[^>]*>\s*<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/g,
  )) {
    assert(Number(x) + Number(w) <= 9144000, "shape exceeds slide width");
    assert(Number(y) + Number(h) <= 5143500, "shape exceeds slide height");
  }
  for (const [, table] of xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)) {
    const height = [...table.matchAll(/<a:tr h="(\d+)"/g)].reduce(
      (sum, row) => sum + Number(row[1]),
      0,
    );
    assert(height <= (5.2 - 1.45) * 914400, "table exceeds body height");
  }
}

function bodyText(pages: string[], omit: string[] = []): string {
  const labels = slideNumbers(pages.map(() => "Content")).map((item) => item.label);
  return [...pages.join("").matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((match) => match[1])
    .filter((text) =>
      text !== "Content" && !labels.includes(text) &&
      !omit.includes(text)
    ).join("").replace(/\s/g, "");
}

// Spec *Slide export*, rule E4: no broken local links; external links remain.
Deno.test("E4: unresolved Markdown and fragment links become ordinary editable text", async () => {
  const runs = [
    { text: "Local", href: "../reader.md#part" },
    { text: "Fragment", href: "#part" },
    { text: "Encoded", href: "reader%2Emd?view=1" },
    { text: "File", href: "file:///reader.md#part" },
    { text: "External", href: "https://example.org/reader.md#part" },
  ];
  const zip = await JSZip.loadAsync(await renderDeck(deck([
    { kind: "paragraph", runs },
    { kind: "quote", runs },
    { kind: "list", ordered: false, items: [{ runs, children: [] }] },
    { kind: "table", rows: [[runs]] },
  ]), options));
  const xml = (await slides(zip)).join("");
  for (const run of runs) assertStringIncludes(xml, run.text);
  const relationships = (await Promise.all(
    Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name)
    ).map((name) => zip.file(name)!.async("string")),
  )).join("");
  assertStringIncludes(relationships, "https://example.org/reader.md#part");
  assert(!relationships.includes("../reader.md"));
  assert(!relationships.includes('Target="#part"'));
  assert(!relationships.includes("reader%2Emd"));
  assert(!relationships.includes("file:///reader.md"));
});

// Spec *Slide export*, rule E6: content fits; long content may paginate.
Deno.test("E6: prose, code, nested lists and following images paginate without losing content or notes", async () => {
  const prose = "Wide WWW words and editable prose. ".repeat(180);
  const code = `${"W".repeat(350)}\n`.repeat(28);
  const item = "Nested list content ".repeat(130);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="900"/>';
  const source = deck([
    { kind: "paragraph", runs: [{ text: prose, bold: true }] },
    { kind: "code", lang: "text", text: code },
    {
      kind: "list",
      ordered: true,
      items: [{
        runs: [{ text: "Parent" }],
        children: [{ runs: [{ text: item }], children: [] }],
      }],
    },
    { kind: "image", src: `data:image/svg+xml;base64,${btoa(svg)}`, alt: "Tall" },
  ]);
  const bytes = await renderDeck(source, options);
  assertEquals(bytes, await renderDeck(source, options));
  const zip = await JSZip.loadAsync(bytes);
  const pages = await slides(zip);
  assert(pages.length > 1);
  for (const page of pages) assertFits(page);
  const joined = bodyText(pages);
  assertStringIncludes(joined, prose.replace(/\s/g, ""));
  assertStringIncludes(joined, code.replace(/\s/g, ""));
  assertStringIncludes(joined, item.replace(/\s/g, ""));
  assertStringIncludes(pages.join(""), 'descr="Tall"');
  const labels = slideNumbers(pages.map(() => "Content"));
  pages.forEach((page, index) => assertStringIncludes(page, labels[index].label));
  for (let index = 1; index <= pages.length; index++) {
    assertStringIncludes(
      await zip.file(`ppt/notesSlides/notesSlide${index}.xml`)!.async("string"),
      "Preserved speaker note.",
    );
  }
});

// Spec *Slide export*, rule E6: wrapped table cells fit and headers repeat.
Deno.test("E6: tables split wrapped oversized rows and repeat native table headers", async () => {
  const text = "A wrapped editable cell ".repeat(160);
  const zip = await JSZip.loadAsync(await renderDeck(deck([{
    kind: "table",
    rows: [
      [[{ text: "Header one" }], [{ text: "Header two" }]],
      [[{ text }], [{ text: "Short" }]],
      ...Array.from({ length: 18 }, (_, index) => [
        [{ text: `Row ${index}` }],
        [{ text: "A few more wrapped words ".repeat(5) }],
      ]),
    ],
  }]), options));
  const pages = await slides(zip);
  assert(pages.length > 1);
  for (const page of pages) {
    assertFits(page);
    assertStringIncludes(page, "<a:tbl>");
    assertStringIncludes(page, "Header one");
    assertStringIncludes(page, "Header two");
  }
  const joined = bodyText(pages, ["Header one", "Header two", "Short"]);
  assertStringIncludes(joined, text.replace(/\s/g, ""));
  assertStringIncludes(joined, "Row17");
});
