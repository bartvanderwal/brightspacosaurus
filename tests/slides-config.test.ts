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

Deno.test("slides configuration supports generated, manual, and combined lesson slide decks", () => {
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

Deno.test("slides.notes is an optional boolean", () => {
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

Deno.test("slides.pptx must be a boolean and passes through resolving", () => {
  const slides = { lessons: { "week/lesson.md": "slides/*.md" }, pptx: true };
  assertEquals(validateConfig({ ...base, slides }), true);
  assertEquals(resolveConfig({ ...base, slides }, {}, "/repo").slides, slides);
  assertThrows(
    () => validateConfig({ ...base, slides: { ...slides, pptx: "yes" } }),
    Error,
    "slides.pptx",
  );
});

Deno.test("remarkPreviewDeckLinks points links to a rendered slide deck at its presentation and leaves other links", () => {
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
  const [deckLink, ...others] = tree.children[0].children as {
    type: string;
    name?: string;
    url?: string;
    attributes?: { type: string; name: string; value: string | null }[];
  }[];
  // The presentation is a static file, not a route: a JSX link that Docusaurus
  // does not check, so its broken-link check does not fail the build.
  assertEquals(deckLink.type, "mdxJsxTextElement");
  assertEquals(deckLink.name, "a");
  assertEquals(deckLink.attributes, [
    {
      type: "mdxJsxAttribute",
      name: "href",
      value: "/course/slides/decks/slides/slides-a/index.html#part",
    },
    { type: "mdxJsxAttribute", name: "data-noBrokenLinkCheck", value: null },
  ]);
  assertEquals(others.map((link) => link.url), [
    "../other.md",
    "https://example.org/slides-a.md",
  ]);
  // No slide decks, no change
  const plain = { type: "root", children: [{ type: "link", url: "x.md" }] };
  remarkPreviewDeckLinks({ lessons: {} })(plain, { path: "/repo/a.md" });
  assertEquals((plain.children[0] as { url: string }).url, "x.md");
});

Deno.test("remarkPreviewDeckLinks turns a slide deck link without a rendered presentation into plain text, so the build does not break", () => {
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

Deno.test("slides.lessons nest is a glob or a list of globs and needs generate", () => {
  const slides = (nest: unknown, generate = true) => ({
    lessons: { "week/overview.md": { generate, nest } },
  });
  assertEquals(
    validateConfig({ ...base, slides: slides("levels/*.md") }),
    true,
  );
  assertEquals(
    validateConfig({ ...base, slides: slides(["a/*.md", "b/*.md"]) }),
    true,
  );
  assertThrows(
    () => validateConfig({ ...base, slides: slides(3) }),
    Error,
    "nest",
  );
  assertThrows(
    () => validateConfig({ ...base, slides: slides([]) }),
    Error,
    "nest",
  );
  assertThrows(
    () => validateConfig({ ...base, slides: slides([""]) }),
    Error,
    "nest",
  );
  assertThrows(
    () => validateConfig({ ...base, slides: slides("a/*.md", false) }),
    Error,
    "generate: true",
  );
});

Deno.test("slides.lessons nest needs generate or decks, and works with a manual deck", () => {
  const base = { courseName: "C", version: "1", sourcesDir: "lessons" };
  validateConfig({
    ...base,
    slides: {
      lessons: { "a.md": { decks: "decks/*.md", nest: "levels/*.md" } },
    },
  });
  assertThrows(
    () =>
      validateConfig({
        ...base,
        slides: { lessons: { "a.md": { nest: "levels/*.md" } } },
      }),
    Error,
    "needs 'generate: true' or 'decks'",
  );
});

Deno.test("remarkPreviewSlides adds the hidden slides marker with a default base URL, and nothing for a page without slides or a path", () => {
  const tree = { children: [] as unknown[] };
  remarkPreviewSlides({ lessons: { "/repo/a.md": "slides/a/index.html" } })(
    tree,
    { path: "/repo/a.md" },
  );
  const marker = tree.children[0] as {
    attributes: { name: string; value: string | null }[];
  };
  assertEquals(
    marker.attributes.find((attribute) => attribute.name === "data-bso-slides")
      ?.value,
    "/slides/a/index.html",
  );
  const other = { children: [] as unknown[] };
  remarkPreviewSlides({ lessons: {} })(other, { path: "/repo/b.md" });
  remarkPreviewSlides({ lessons: {} })(other, {});
  assertEquals(other.children.length, 0);
});

Deno.test("remarkPreviewDeckLinks recognises a deck on disk by default, and keeps a link to a file that is not a deck", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({ dir: "build", prefix: "deck-links-" });
  try {
    const dir = `${Deno.cwd()}/${root}`;
    await Deno.writeTextFile(`${dir}/deck.md`, "---\nslides: true\n---\n# D\n");
    await Deno.writeTextFile(`${dir}/page.md`, "# Page\n");
    const link = (url: string) => ({
      type: "root",
      children: [{ type: "link", url, children: [] }],
    });
    const plugin = remarkPreviewDeckLinks({ lessons: {} });
    const deck = link("deck.md");
    plugin(deck, { path: `${dir}/lesson.md` });
    // No presentation was rendered, so the link becomes text.
    assertEquals(
      (deck.children[0] as { type: string }).type,
      "mdxJsxTextElement",
    );
    const page = link("page.md");
    plugin(page, { path: `${dir}/lesson.md` });
    assertEquals((page.children[0] as { url?: string }).url, "page.md");
    const missing = link("missing.md");
    plugin(missing, { path: `${dir}/lesson.md` });
    assertEquals((missing.children[0] as { url?: string }).url, "missing.md");
    // Without a path of the page there is nothing to resolve against.
    const none = link("deck.md");
    plugin(none, {});
    assertEquals((none.children[0] as { url?: string }).url, "deck.md");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("slides.titlePrefix must be a valid regular expression", () => {
  const base = { courseName: "C", version: "1.0.0", sourcesDir: "lessons" };
  assertEquals(
    validateConfig({
      ...base,
      slides: { generateForPrefix: "lesson-", titlePrefix: "Slide \\d+ - " },
    }),
    true,
  );
  for (const value of ["", "(", 5]) {
    assertThrows(
      () =>
        validateConfig({
          ...base,
          slides: { generateForPrefix: "lesson-", titlePrefix: value },
        }),
      Error,
      "slides.titlePrefix",
    );
  }
});
