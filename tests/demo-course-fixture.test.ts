import { assertEquals, assertStringIncludes } from "@std/assert";
import { join, resolve } from "@std/path";
import {
  findConfigFile,
  loadConfig,
  resolveConfig,
} from "../src/config-loader.ts";

const demoRoot = join("examples", "demo-course");

Deno.test("demo preview resolves the same app from the checkout and course roots", async () => {
  for (const cwd of [Deno.cwd(), resolve(demoRoot)]) {
    const configPath = await findConfigFile(cwd);
    if (!configPath) throw new Error(`Missing demo config in ${cwd}`);
    const config = resolveConfig(await loadConfig(configPath), {}, cwd);
    assertEquals(config.flashcards?.sectionHeadings, ["Core concepts"]);
    assertEquals(config.sourcesDir, resolve(demoRoot, "lessons"));
    assertEquals(config.readersDir, resolve(demoRoot, "readers"));
    assertEquals(config.docusaurusDir, resolve("demo-course-docs"));
    const pkg = JSON.parse(
      await Deno.readTextFile(join(config.docusaurusDir!, "package.json")),
    );
    assertEquals(pkg.scripts.start, "docusaurus start");
  }
});

Deno.test("demo-course fixture keeps the manual Brightspace regression scenarios", async () => {
  const config = JSON.parse(
    await Deno.readTextFile(join(demoRoot, "brightspacosaurus.config.json")),
  );
  assertEquals(config.sourcesDir, "lessons/");
  assertEquals(config.readersDir, "readers/");

  const handbook = await Deno.readTextFile(
    join(demoRoot, "lessons", "README.md"),
  );
  assertStringIncludes(
    handbook,
    "[Lesson 1.1: FizzBuzz](week-1/lesson-1-fizzbuzz.md)",
  );
  assertStringIncludes(
    handbook,
    "[Lesson 1.2: Test pyramid and test strategy](week-1/lesson-2-test-strategy.md)",
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
      entries.filter((name) =>
        name.endsWith(".md") && name.startsWith("lesson-")
      ).length,
      4,
    );
    assertEquals(
      entries.filter((name) => name.startsWith("quiz-")).length,
      week === "week-1" ? 3 : 4,
    );
  }

  // Quiz 2.4 is the regression scenario for Quizzosaurus question types and
  // code in prompts and answer options (#50, #72).
  const questionTypes = await Deno.readTextFile(
    join(demoRoot, "lessons", "week-2", "quiz-4-question-types.md"),
  );
  assertStringIncludes(questionTypes, "````quiz");
  assertStringIncludes(questionTypes, "- (x) ");
  assertStringIncludes(questionTypes, "- [x] ");
  assertStringIncludes(questionTypes, "\n= POST");
  assertStringIncludes(questionTypes, "  ```jsx\n");

  const flashcards = await Deno.readTextFile(
    join(demoRoot, "lessons", "week-1", "lesson-4-core-concepts.md"),
  );
  assertEquals((flashcards.match(/^:::flashcard$/gm) ?? []).length, 8);
  assertStringIncludes(flashcards, "term: Unit test");
  assertStringIncludes(flashcards, "## Core concepts");
  assertStringIncludes(flashcards, "- **request:**");
  assertStringIncludes(flashcards, "**unit test**");
  assertStringIncludes(flashcards, "_end-to-end test_");
});
