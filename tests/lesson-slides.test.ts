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
