import { assertEquals, assertThrows } from "@std/assert";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { remarkPreviewSlides } from "../src/slides-preview-remark.ts";

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

Deno.test("slides configuration rejects invalid fields, mappings and paths", () => {
  for (
    const slides of [
      null,
      [],
      "slides",
      {},
      { lessons: [] },
      { lessons: null },
      { lessons: {}, unknown: true },
      { lessons: {}, disclaimer: false },
      { lessons: { "lesson.md": "" } },
      { lessons: { "lesson.md": 42 } },
      { lessons: { "lesson.html": "slides/*.md" } },
      { lessons: { "../lesson.md": "slides/*.md" } },
      { lessons: { "/lesson.md": "slides/*.md" } },
      { lessons: { "lesson.md": "../slides/*.md" } },
      { lessons: { "lesson.md": "C:\\slides\\*.md" } },
    ]
  ) {
    assertThrows(() => validateConfig({ ...base, slides }));
  }
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
