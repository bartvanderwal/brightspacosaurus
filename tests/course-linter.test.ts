import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join, relative, resolve } from "@std/path";
import fc from "fast-check";
import {
  formatLintDiagnostic,
  lintCourse,
  lintMarkdown,
} from "../src/course-linter.ts";
import {
  loadConfig,
  resolveConfig,
  validateConfig,
} from "../src/config-loader.ts";

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

Deno.test("lint accepts compact flashcard lists and warns on incomplete sets", () => {
  assertEquals(
    lintMarkdown(
      ":::flashcards\n\n- **request:** Message.\n- response: Reply.\n\n:::",
      "lesson.md",
    ),
    [],
  );
  for (
    const item of [
      "- missing separator",
      "- term:",
      "1. term: numbered",
      "- [ ] term: task",
    ]
  ) {
    const issues = lintMarkdown(`:::flashcards\n\n${item}\n\n:::`, "lesson.md");
    assertEquals(
      issues.some((issue) => issue.rule === "flashcard-empty-set"),
      true,
    );
  }
});

Deno.test("configured flashcard sections warn unless they contain only complete bullet lists", () => {
  const options = {
    flashcards: { sectionHeadings: ["Core concepts", "Kernbegrippen"] },
  };
  for (
    const body of [
      "",
      "A paragraph.",
      "- missing colon",
      "- **term:**",
      "1. term: numbered",
      "- [ ] term: task",
      "### Subheading\n\n- term: definition",
      "- valid: Definition.\n\nAn extra paragraph.",
      "```md\n- term: literal\n```",
      "---",
      "> term: quote",
    ]
  ) {
    const issues = lintMarkdown(
      `## Core concepts\n\n${body}\n\n## Next\n\nOrdinary prose.`,
      "lesson.md",
      options,
    );
    assertEquals(
      issues.map(({ rule }) => rule),
      ["flashcard-section-content"],
      body,
    );
    assertEquals(issues[0].severity, "warning");
  }
  const valid =
    "## CORE CONCEPTS\n\n- **request:** A **message**.\n- response: Reply: `200`.\n\n## Next\n\nOrdinary prose.";
  assertEquals(lintMarkdown(valid, "lesson.md", options), []);
  assertEquals(
    lintMarkdown("## Kernbegrippen\n\nNot a list.", "lesson.md", options)[0]
      .rule,
    "flashcard-section-content",
  );
  assertEquals(
    lintMarkdown("## Other\n\nNot a list.", "lesson.md", options),
    [],
  );
  assertEquals(
    lintMarkdown("## Core concepts\n\nNot a list.", "lesson.md")[0].rule,
    "flashcard-section-content",
  );
  assertEquals(
    lintMarkdown("## Core concepts\n\nNot a list.", "lesson.md", {
      flashcards: { sectionHeadings: [] },
    }),
    [],
  );
  assertEquals(
    lintMarkdown(
      "## 7. Kernbegrippen\n\nNot a list.",
      "lesson.md",
      options,
    )[0].rule,
    "flashcard-section-content",
  );
  assertEquals(
    lintMarkdown(
      "## Core concepts\n\n- term: Good.\n\n# End\n\nNot a list.",
      "lesson.md",
      options,
    ),
    [],
  );
});

Deno.test("lint directory selection is validated, recursive, deduplicated and overridden by --sources", async () => {
  const root = await Deno.makeTempDir();
  const base = {
    courseName: "Selection",
    version: "1",
    sourcesDir: "lessons",
    readersDir: "readers",
  };
  try {
    await Deno.mkdir(join(root, "lessons/good/nested"), { recursive: true });
    await Deno.mkdir(join(root, "lessons/bad"), { recursive: true });
    await Deno.mkdir(join(root, "readers"), { recursive: true });
    await Deno.writeTextFile(
      join(root, "lessons/good/nested/lesson.md"),
      "# Good",
    );
    await Deno.writeTextFile(
      join(root, "lessons/bad/lesson.md"),
      "::flashcard",
    );
    await Deno.writeTextFile(
      join(root, "readers/reader-bad.md"),
      "::flashcard",
    );
    const config = {
      ...base,
      lint: { includeDirs: ["lessons/good", "lessons/good/nested"] },
    };
    assertEquals(validateConfig(config), true);
    const resolved = resolveConfig(config, {}, root);
    assertEquals(resolved.lint?.includeDirs, [
      join(root, "lessons/good"),
      join(root, "lessons/good/nested"),
    ]);
    assertEquals(await lintCourse(resolved), {
      filesChecked: 1,
      diagnostics: [],
    });
    assertEquals(
      (await lintCourse(resolveConfig(base, {}, root))).diagnostics.length,
      2,
    );
    const selected = await lintCourse(
      resolveConfig(config, { sources: "lessons/bad" }, root),
    );
    assertEquals(selected.filesChecked, 1);
    assertEquals(selected.diagnostics.length, 1);
    await assertRejects(() =>
      lintCourse(
        resolveConfig(
          { ...base, lint: { includeDirs: ["missing"] } },
          {},
          root,
        ),
      )
    );
    await assertRejects(
      () =>
        lintCourse(
          resolveConfig({ ...base, lint: { includeDirs: [".."] } }, {}, root),
        ),
      Error,
      "outside",
    );
    assertEquals(validateConfig({ ...base, lint: {} }), true);
    for (
      const lint of [
        null,
        [],
        true,
        { unknown: [] },
        { includeDirs: [] },
        { includeDirs: "lessons" },
        { includeDirs: [""] },
        { includeDirs: [4] },
      ]
    ) {
      assertThrows(() => validateConfig({ ...base, lint }), Error, "lint");
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("clean demo has no diagnostics and antipattern demo has exactly one fixture per lint rule", async () => {
  const clean = resolveConfig(
    await loadConfig(resolve("brightspacosaurus.config.json")),
    {},
    Deno.cwd(),
  );
  assertEquals((await lintCourse(clean)).diagnostics, []);
  const root = resolve("examples/demo-course-with-all-lint-issues");
  const config = resolveConfig(
    await loadConfig(join(root, "brightspacosaurus.config.json")),
    {},
    root,
  );
  const expected: Record<string, string> = JSON.parse(
    await Deno.readTextFile(join(root, "expected-rules.json")),
  );
  assertEquals(
    new Set(Object.values(expected)).size,
    Object.keys(expected).length,
  );
  const result = await lintCourse(config);
  assertEquals(result.filesChecked, Object.keys(expected).length);
  assertEquals(result.diagnostics.length, Object.keys(expected).length);
  const actual: Record<string, string> = {};
  for (const diagnostic of result.diagnostics) {
    const file = relative(root, diagnostic.sourceFile);
    assertEquals(actual[file], undefined, `Duplicate diagnostic in ${file}`);
    actual[file] = diagnostic.rule;
    assertEquals(diagnostic.line > 0 && diagnostic.column > 0, true);
  }
  assertEquals(actual, expected);
  assertEquals(await lintCourse(config), result);
});

Deno.test("local CLI runs clean and antipattern configs, and can select a single subfolder", async () => {
  for (
    const [cwd, args, code, summary] of [
      [Deno.cwd(), [], 0, "0 errors, 0 warnings"],
      [
        resolve("examples/demo-course-with-all-lint-issues"),
        [],
        1,
        "24 errors, 3 warnings",
      ],
      [
        resolve("examples/demo-course-with-all-lint-issues"),
        ["--sources", "lessons/diagrams"],
        1,
        "5 errors, 0 warnings",
      ],
    ] as const
  ) {
    const result = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        resolve("deno.json"),
        "--allow-read",
        "--allow-env",
        resolve("src/main.ts"),
        "lint",
        ...args,
      ],
      cwd,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(result.code, code, new TextDecoder().decode(result.stderr));
    assertStringIncludes(new TextDecoder().decode(result.stdout), summary);
  }
});
