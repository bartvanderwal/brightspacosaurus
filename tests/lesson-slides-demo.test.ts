import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { generateLessonSlides } from "../src/lesson-slides.ts";

const lessons = join("examples", "demo-course", "lessons");

async function slidesOf(file: string): Promise<string[]> {
  const deck = generateLessonSlides(
    await Deno.readTextFile(join(lessons, file)),
    { contentsTitle: "Contents" },
  );
  return deck.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n\n---\n\n");
}

Deno.test("a lesson with code sections shows that code on its slides (demo lesson 1.1)", async () => {
  const slides = await slidesOf("week-1/lesson-1-fizzbuzz.md");
  const withCode = slides.filter((slide) => slide.includes("```java"));
  assert(withCode.length >= 3, "the Java sections must keep their code");
  assertStringIncludes(withCode.join("\n"), "class FizzBuzzer");
  assertStringIncludes(withCode.join("\n"), "fizzBuzz(");
  // no slide with only its heading when its section has code
  for (const heading of ["Implementation", "Command-line", "Unit test"]) {
    const own = slides.filter((slide) =>
      slide.startsWith("# ") && slide.includes(heading) &&
      !slide.startsWith("# Contents")
    );
    assert(
      own.length > 0 && own.every((slide) => slide.includes("```")),
      heading,
    );
  }
});

Deno.test("the contents slide of demo lesson 1.1 lists the numbered sections without nested numbering", async () => {
  const slides = await slidesOf("week-1/lesson-1-fizzbuzz.md");
  const contents = slides.find((slide) => slide.startsWith("# Contents"))!;
  assertStringIncludes(contents, "- 1\\. Introduction");
  assertEquals(
    contents.split("\n").filter((line) => line.startsWith("- ")).length,
    5,
  );
  // a bare "- 1. Intro" would render as a nested ordered list (roman numbers)
  assert(!/^- \d+\. /m.test(contents));
});

Deno.test("long code continues on further slides instead of overflowing one", () => {
  const code = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");
  const slides = generateLessonSlides(
    `# L\n\n## 1. Code\n\n\`\`\`js\n${code}\n\`\`\`\n`,
  )
    .split("\n\n---\n\n")
    .filter((slide) => slide.includes("```js"));
  assertEquals(slides.length, 3);
  for (const slide of slides) assert(slide.split("\n").length <= 16 + 5);
  assertStringIncludes(slides[2], "line 40");
});
