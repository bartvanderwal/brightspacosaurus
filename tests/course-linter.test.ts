import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join, resolve } from "@std/path";
import fc from "fast-check";
import {
  formatLintDiagnostic,
  lintCourse,
  lintMarkdown,
} from "../src/course-linter.ts";
import { resolveConfig } from "../src/config-loader.ts";

const card = ":::flashcard\nterm: Test\n\nA **definition**.\n:::";
const valid = `::::flashcards\n\n${card}\n\n${card}\n\n::::`;

Deno.test("lint catches prematurely closed flashcard sets at the inner fence", () => {
  assertEquals(lintMarkdown(valid, "lesson.md"), []);
  const issues = lintMarkdown(valid.replaceAll("::::", ":::"), "lesson.md");
  assertEquals(
    issues.some((issue) =>
      issue.rule === "flashcard-fence-nesting" && issue.line === 3
    ),
    true,
  );
  assertEquals(
    issues.some((issue) => issue.rule === "flashcard-outside-set"),
    true,
  );
  for (
    const [source, rule] of [
      ["::flashcard", "flashcard-container"],
      ["::::flashcards\n\n" + card, "flashcard-unclosed"],
      [valid.replaceAll("term: Test", "Term is missing"), "flashcard-term"],
      ["::::flashcards\n::::", "flashcard-empty-set"],
      [valid.replaceAll("\n\nA **definition**.", ""), "flashcard-definition"],
    ]
  ) {
    assertEquals(
      lintMarkdown(source, "lesson.md").some((issue) => issue.rule === rule),
      true,
      rule,
    );
  }
});

Deno.test("lint ignores literal examples and reports include and diagram authoring errors", () => {
  const examples =
    `\`\`\`markdown\n${card}\n{@include: missing}\n\`\`\`\n\n    :::flashcard\n\nInline \`:::flashcard\`.\n`;
  assertEquals(lintMarkdown(examples, "lesson.md"), []);
  assertEquals(
    lintMarkdown("{@include: missing}", "lesson.md")[0].rule,
    "include-syntax",
  );
  assertEquals(
    lintMarkdown("{@include something", "lesson.md")[0].rule,
    "include-syntax",
  );
  assertEquals(
    lintMarkdown("```mermaid\n```", "lesson.md")[0].rule,
    "diagram-empty-diagram",
  );
  assertEquals(
    lintMarkdown(":::flashcards\n:::", "lesson.md")[0].severity,
    "warning",
  );
});

Deno.test("lint shares quiz validation and formats source locations for editors", () => {
  const source =
    "# Quiz\n## Vraag 2\nQuestion?\n- A. Yes\n- B. No\nAntwoord: Z\n";
  const issues = lintMarkdown(source, "/repo/quiz-test.md");
  assertEquals(issues.length, 1);
  assertEquals(issues[0].rule, "quiz-answer");
  assertStringIncludes(
    formatLintDiagnostic(issues[0], "/repo"),
    "quiz-test.md:2:1: error quiz-answer: Question 2:",
  );
  assertEquals(lintMarkdown(source.replace("Z", "a"), "quiz-test.md"), []);
});

Deno.test("lint follows includes once, checks readers and reports missing, unsafe and cyclic targets", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(root, "lessons"));
    await Deno.mkdir(join(root, "readers"));
    await Deno.writeTextFile(
      join(root, "partial.md"),
      "{@include: [cycle](lessons/a.md)}",
    );
    await Deno.writeTextFile(
      join(root, "lessons", "a.md"),
      "{@include: [partial](../partial.md)}",
    );
    await Deno.writeTextFile(
      join(root, "lessons", "b.md"),
      "{@include: [missing](missing.md)}\n{@include: [outside](../../outside.md)}\n{@include: [remote](https://example.test/a.md)}\n{@include: [self](b.md)}\n{@include: [dir](.)}",
    );
    await Deno.writeTextFile(
      join(root, "readers", "reader-demo.md"),
      "::::flashcards\n::::",
    );
    const config = resolveConfig(
      {
        courseName: "Lint",
        version: "1",
        sourcesDir: "lessons",
        readersDir: "readers",
      },
      {},
      root,
    );
    const result = await lintCourse(config);
    assertEquals(result.filesChecked, 4);
    for (
      const rule of [
        "include-cycle",
        "include-missing",
        "include-path",
        "flashcard-empty-set",
      ]
    ) {
      assertEquals(
        result.diagnostics.some((issue) => issue.rule === rule),
        true,
        rule,
      );
    }
    assertEquals(await lintCourse(config), result);
    await assertRejects(
      () => Deno.stat(config.outputDir),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("property: valid nested fences remain clean and diagnostics are deterministic", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 4, max: 12 }),
      fc.integer({ min: 1, max: 10 }),
      (width, count) => {
        const source = `${":".repeat(width)}flashcards\n\n${
          Array(count).fill(card).join("\n\n")
        }\n\n${":".repeat(width)}`;
        assertEquals(lintMarkdown(source, "lesson.md"), []);
        assertEquals(
          lintMarkdown(card, "lesson.md"),
          lintMarkdown(card, "lesson.md"),
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("CLI lint is read-only, fails on errors and succeeds with warnings", async () => {
  const root = await Deno.makeTempDir();
  try {
    for (
      const [source, code, message] of [
        [card, 1, "error flashcard-outside-set"],
        ["::::flashcards\n::::", 0, "warning flashcard-empty-set"],
        [valid, 0, ""],
      ] as const
    ) {
      await Deno.writeTextFile(join(root, "lesson.md"), source);
      const output = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--config",
          resolve("deno.json"),
          "--allow-read",
          "--allow-env",
          resolve("src/main.ts"),
          "lint",
          "--sources",
          ".",
        ],
        cwd: root,
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(output.code, code, new TextDecoder().decode(output.stderr));
      assertStringIncludes(new TextDecoder().decode(output.stderr), message);
      assertStringIncludes(
        new TextDecoder().decode(output.stdout),
        "Checked 1 Markdown files",
      );
    }
    assertEquals([...Deno.readDirSync(root)].map((file) => file.name), [
      "lesson.md",
    ]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
