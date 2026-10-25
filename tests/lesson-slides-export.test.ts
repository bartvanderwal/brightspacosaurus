import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  generateLessonSlides,
  type LessonSlidesOptions,
} from "../src/lesson-slides.ts";

// Spec *Slide export*, rules E2, E3 and E5.
function slidesOf(source: string, options: LessonSlidesOptions = {}): string[] {
  return generateLessonSlides(source, options)
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .trim()
    .split("\n\n---\n\n");
}

Deno.test("E3: an image under the H1 remains on the generated title slide", () => {
  const slides = slidesOf(
    "# Lesson\n\n![Opening](opening.png)\n\nRunning introduction.\n\n## Topic\n\n- point",
  );
  assertStringIncludes(slides[0], "# Lesson\n\n![Opening](opening.png)");
  assertEquals(slides[0].includes("Running introduction."), false);
  assertEquals(slides.length, 2);
});

Deno.test("E3: reference images under the H1 retain their definitions", () => {
  const result = generateLessonSlides(
    "# Lesson\n\n![Opening][cover]\n\n## Topic\n\n- point\n\n[cover]: opening.png",
  );
  assertStringIncludes(result, "# Lesson\n\n![Opening][cover]");
  assertStringIncludes(result, "[cover]: opening.png");
});

Deno.test("E5: nested title sections retain the image and first intro prose paragraph", () => {
  const slides = slidesOf("# Overview\n\n## 2. Topic\n\n[Child](child.md)", {
    nestedPage: () => ({
      id: "child",
      source:
        "# Child\n\n![Opening](child.png)\n\nFirst **intro** paragraph.\n\nSecond paragraph.\n\n## Detail\n\n- point",
    }),
  });
  assertStringIncludes(
    slides[1],
    "# 2.1 Child\n\n![Opening](child.png)\n\nFirst **intro** paragraph.",
  );
  assertEquals(slides.join("\n").includes("Second paragraph."), false);
  assertStringIncludes(slides[2], "# Detail\n\n- point");
});

Deno.test("E5: nested pages without an intro paragraph keep a title-only section", () => {
  const slides = slidesOf("# Overview\n\n## Topic\n\n[Child](child.md)", {
    nestedPage: () => ({ id: "child", source: "# Child\n\n## Detail\n\n- point" }),
  });
  assertEquals(slides[1], "# Child");
});

Deno.test("E2: empty appendix sections retain an inclusive appendix boundary", () => {
  for (const heading of ["Bijlagen", "Bijlage A: verdieping"]) {
    const slides = slidesOf(
      `# Lesson\n\n## Topic\n\n- point\n\n## ${heading}`,
      { contentsTitle: "Contents" },
    );
    assertEquals(slides.at(-1), "# Bijlagen");
    assertStringIncludes(slides[1], "- Bijlagen (B1 t/m B1)");
    assertEquals(slides[1].includes("Bijlage A:"), false);
  }
});

Deno.test("E2: appendix counts include the boundary, nested slides and the remaining tail", () => {
  const source =
    "# Overview\n\n## 2. Topic\n\n- point\n\n[Child](child.md)\n\n## Bijlagen\n\n[Extra](extra.md)\n\n## Closing\n\n- end";
  const options: LessonSlidesOptions = {
    contentsTitle: "Contents",
    nestedPage: (url) => ({
      id: url,
      source: url === "child.md"
        ? "# Child\n\n## Detail\n\n- child"
        : "# Extra\n\n## Detail\n\n- appendix",
    }),
  };
  const slides = slidesOf(source, options);
  assertStringIncludes(
    slides[1],
    "- 2\\. Topic\n  - 2.1 Child\n- Bijlagen (B1 t/m B4)",
  );
  assertEquals(slides[1].includes("- Closing"), false);
  assertEquals(slides[1].includes("- Extra"), false);
  assertEquals(slides.at(-4), "# Bijlagen");
  assertEquals(
    generateLessonSlides(source, options),
    generateLessonSlides(source, options),
  );
});

Deno.test("E2: appendix counts include split section and linked deck slides, not fenced separators", () => {
  const items = Array.from({ length: 7 }, (_, index) => `- item ${index}`).join(
    "\n",
  );
  const slides = slidesOf(
    `# Lesson\n\n## Topic\n\n- point\n\n## Bijlagen\n\n${items}\n\n[Deck](deck.md)`,
    {
      contentsTitle: "Contents",
      linkedDeck: () => ({
        id: "deck",
        title: "Extra",
        markdown: "# One\n\n```text\n---\n```\n\n---\n\n# Two",
      }),
    },
  );
  assertStringIncludes(slides[1], "- Bijlagen (B1 t/m B4)");
});

Deno.test("E2: appendix detection does not change numbered nested contents without appendices", () => {
  const slides = slidesOf(
    "# Overview\n\n## 2.1 Topic\n\n- point\n\n[Child](child.md)\n\n## 3. End\n\n- end",
    {
      contentsTitle: "Contents",
      nestedPage: () => ({ id: "child", source: "# Child" }),
    },
  );
  assertStringIncludes(
    slides[1],
    "- 2.1 Topic\n  - 2.1.1 Child\n- 3\\. End",
  );
  assertEquals(slides[1].includes("Bijlagen"), false);
});
