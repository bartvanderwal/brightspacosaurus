import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

const demoRoot = join("examples", "demo-course");

Deno.test("demo-course fixture keeps the manual Brightspace regression scenarios", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(join(demoRoot, "brightspacosaurus.config.json")),
  );
  assertEquals(config.sourcesDir, "lessons/");
  assertEquals(config.readersDir, "readers/");

  const handbook = await Deno.readTextFile(
    join(demoRoot, "lessons", "README.md"),
  );
  assertStringIncludes(handbook, "[Lesson 1: FizzBuzz](week-1/lesson-1-fizzbuzz.md)");
  assertStringIncludes(
    handbook,
    "[Lesson 2: Test pyramid and test strategy](week-1/lesson-2-test-strategy.md)",
  );

  const strategyLesson = await Deno.readTextFile(
    join(demoRoot, "lessons", "week-1", "lesson-2-test-strategy.md"),
  );
  assertStringIncludes(
    strategyLesson,
    "[Testing Basics reader](../../readers/reader-testing-basics.md)",
  );

  const reader = await Deno.readTextFile(
    join(demoRoot, "readers", "reader-testing-basics.md"),
  );
  assertStringIncludes(reader, "```mermaid");
  assertStringIncludes(reader, "```plantuml");

  for (const week of ["week-1", "week-2"]) {
    const lessonDir = join(demoRoot, "lessons", week);
    const entries = [];
    for await (const entry of Deno.readDir(lessonDir)) entries.push(entry.name);
    assertEquals(
      entries.filter((name) => name.endsWith(".md") && name.startsWith("lesson-")).length,
      week === "week-1" ? 4 : 3,
    );
    assertEquals(entries.filter((name) => name.startsWith("quiz-")).length, 3);
  }

  const flashcards = await Deno.readTextFile(
    join(demoRoot, "lessons", "week-1", "lesson-4-core-concepts.md"),
  );
  assertEquals((flashcards.match(/^:::flashcard$/gm) ?? []).length, 8);
  assertStringIncludes(flashcards, "term: Unit test");
  assertStringIncludes(flashcards, "**unit test**");
  assertStringIncludes(flashcards, "_end-to-end test_");
});
