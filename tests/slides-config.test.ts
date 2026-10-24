import { assertEquals, assertThrows } from "@std/assert";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import {
  remarkPreviewDeckLinks,
  remarkPreviewSlides,
} from "../src/slides-preview-remark.ts";

const base = { courseName: "Course", version: "1.0.0", sourcesDir: "lessons" };

Deno.test("slides configuration is optional and preserves an empty disclaimer", () => {
  assertEquals(validateConfig(base), true);
  const slides = {
    lessons: { "week/lesson.md": "slides/**/*.md" },
    disclaimer: "",
  };
  assertEquals(validateConfig({ ...base, slides }), true);
  assertEquals(resolveConfig({ ...base, slides }, {}, "/repo").slides, slides);
});

Deno.test("slides configuration supports generated, manual, and combined lesson decks", () => {
  const slides = {
    lessons: {
      "generated.md": { generate: true },
      "manual.md": "slides/manual/*.md",
      "both.md": { generate: true, decks: "slides/both/*.md" },
    },
  };
  assertEquals(validateConfig({ ...base, slides }), true);
  assertEquals(resolveConfig({ ...base, slides }, {}, "/repo").slides, slides);
  const prefixOnly = {
    generateForPrefix: "lesoverzicht",
  };
  assertEquals(validateConfig({ ...base, slides: prefixOnly }), true);
  assertEquals(
    resolveConfig({ ...base, slides: prefixOnly }, {}, "/repo").slides,
    prefixOnly,
  );
  assertEquals(
    validateConfig({
      ...base,
      slides: {
        generateForPrefix: "lesoverzicht",
        lessons: { "week/lesoverzicht-extra.md": { generate: false } },
      },
    }),
    true,
  );
});

Deno.test("slides configuration rejects invalid fields, mappings and paths", () => {
  for (
    const slides of [
      null,
      [],
      "slides",
      {},
      { lessons: [] },
      { lessons: null },
      { lessons: {}, generateForPrefix: "" },
      { generateForPrefix: "week/lesson" },
      { lessons: {}, unknown: true },
      { lessons: {}, disclaimer: false },
      { lessons: {}, notes: "yes" },
      { lessons: {}, notes: 1 },
      { lessons: {}, theme: "" },
      { lessons: {}, logo: 42 },
      { lessons: {}, theme: "../theme.css" },
      { lessons: {}, logo: "/logo.png" },
      { lessons: { "lesson.md": "" } },
      { lessons: { "lesson.md": 42 } },
      { lessons: { "lesson.html": "slides/*.md" } },
      { lessons: { "lesson.md": { generate: false } } },
      { lessons: { "lesson.md": { generate: "yes" } } },
      { lessons: { "lesson.md": { generate: true, decks: "" } } },
      { lessons: { "lesson.md": { generate: true, unknown: true } } },
      { lessons: { "lesson.md": { decks: "../slides/*.md" } } },
      { lessons: { "../lesson.md": "slides/*.md" } },
      { lessons: { "/lesson.md": "slides/*.md" } },
      { lessons: { "lesson.md": "../slides/*.md" } },
      { lessons: { "lesson.md": "C:\\slides\\*.md" } },
    ]
  ) {
    assertThrows(() => validateConfig({ ...base, slides }));
  }
});

Deno.test("slide theme and logo paths resolve from the repository root", () => {
  const slides = {
    lessons: { "week/lesson.md": "slides/**/*.md" },
    theme: "shared/slides-theme.css",
    logo: "shared/slides-logo.png",
  };
  assertEquals(validateConfig({ ...base, slides }), true);
  assertEquals(resolveConfig({ ...base, slides }, {}, "/repo").slides, {
    ...slides,
    theme: "/repo/shared/slides-theme.css",
    logo: "/repo/shared/slides-logo.png",
  });

  assertEquals(
    resolveConfig(
      {
        ...base,
        readerCoverLogo: "shared/reader-logo.png",
        slides: { lessons: {} },
      },
      {},
      "/repo",
    ).slides,
    {
      lessons: {},
      logo: "/repo/shared/reader-logo.png",
    },
  );
  assertEquals(
    resolveConfig(
      {
        ...base,
        readerCoverLogo: "shared/reader-logo.png",
        slides: { lessons: {}, logo: "shared/slides-logo.png" },
      },
      {},
      "/repo",
    ).slides?.logo,
    "/repo/shared/slides-logo.png",
  );
});

Deno.test("slide metadata follows source file identity, not page slug, with baseUrl", () => {
  const tree = { children: [] as unknown[] };
  const plugin = remarkPreviewSlides({
    lessons: { "/repo/lessons/lesson.md": "slides/lesson/index.html" },
    baseUrl: "/course/",
  });
  plugin(tree, { path: "/repo/lessons/other.md" });
  assertEquals(tree.children, []);
  plugin(tree, { path: "/repo/lessons/lesson.md" });
  assertEquals(tree.children, [{
    type: "mdxJsxFlowElement",
    name: "span",
    attributes: [
      { type: "mdxJsxAttribute", name: "hidden", value: null },
      {
        type: "mdxJsxAttribute",
        name: "data-bso-slides",
        value: "/course/slides/lesson/index.html",
      },
    ],
    children: [],
  }]);
});

Deno.test("slides.notes is an optional boolean (#117)", () => {
  const lessons = { "week/lesson.md": "slides/**/*.md" };
  assertEquals(
    validateConfig({ ...base, slides: { lessons, notes: true } }),
    true,
  );
  assertEquals(
    validateConfig({ ...base, slides: { lessons, notes: false } }),
    true,
  );
  assertEquals(validateConfig({ ...base, slides: { lessons } }), true);
});

Deno.test("slides.pptx must be a boolean and passes through resolving (#115)", () => {
  const slides = { lessons: { "week/lesson.md": "slides/*.md" }, pptx: true };
  assertEquals(validateConfig({ ...base, slides }), true);
  assertEquals(resolveConfig({ ...base, slides }, {}, "/repo").slides, slides);
  assertThrows(
    () => validateConfig({ ...base, slides: { ...slides, pptx: "yes" } }),
    Error,
    "slides.pptx",
  );
});

Deno.test("remarkPreviewDeckLinks points links to a rendered deck at its presentation and leaves other links (#144)", () => {
  const transform = remarkPreviewDeckLinks({
    lessons: {
      "/repo/lessons/week/lesson.md": "slides/week/lesson/index.html",
      "deck:/repo/slides/slides-a.md":
        "slides/decks/slides/slides-a/index.html",
    },
    baseUrl: "/course",
  });
  const tree = {
    type: "root",
    children: [{
      type: "paragraph",
      children: [
        { type: "link", url: "../../slides/slides-a.md#part", children: [] },
        { type: "link", url: "../other.md", children: [] },
        { type: "link", url: "https://example.org/slides-a.md", children: [] },
      ],
    }],
  };
  transform(tree, { path: "/repo/lessons/week/lesson.md" });
  const urls = tree.children[0].children.map((link) => link.url);
  assertEquals(urls, [
    "/course/slides/decks/slides/slides-a/index.html#part",
    "../other.md",
    "https://example.org/slides-a.md",
  ]);
  // No decks, no change
  const plain = { type: "root", children: [{ type: "link", url: "x.md" }] };
  remarkPreviewDeckLinks({ lessons: {} })(plain, { path: "/repo/a.md" });
  assertEquals((plain.children[0] as { url: string }).url, "x.md");
});

Deno.test("remarkPreviewDeckLinks turns a deck link without a rendered presentation into plain text, so the build does not break (#144)", () => {
  const transform = remarkPreviewDeckLinks({
    lessons: {},
    isDeck: (path) => path.endsWith("/slides/deck.md"),
  });
  const deck = {
    type: "link",
    url: "../slides/deck.md",
    children: [{ type: "text" }],
  };
  const page = { type: "link", url: "../slides/page.md", children: [] };
  transform({ type: "root", children: [deck, page] }, {
    path: "/repo/lessons/lesson.md",
  });
  assertEquals(deck.type, "mdxJsxTextElement");
  assertEquals("url" in deck, false);
  assertEquals(page.type, "link");
});
