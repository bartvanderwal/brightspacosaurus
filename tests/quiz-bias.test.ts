import { assertEquals } from "@std/assert";
import { checkQuizBias, parseTeacherAnswers } from "../src/quiz-bias.ts";
import { parseQuizMarkdown } from "../src/quiz-parser.ts";
import { lintMarkdown } from "../src/course-linter.ts";

/** Builds quiz Markdown; each question is [correct letter, option texts]. */
function quiz(...questions: [string, string[]][]): string {
  return "# Quiz\n\n" +
    questions.map(([correct, texts], index) =>
      `## Question ${index + 1}\n\nQuestion?\n\n${
        texts.map((text, i) => `- ${"ABCD"[i]}. ${text}`).join("\n")
      }\n\nCorrect answer: **${correct}**\n`
    ).join("\n");
}

const equal = (): string[] => ["Aaaa", "Bbbb", "Cccc", "Dddd"];
const rules = (markdown: string, teacher?: string, options = {}) =>
  checkQuizBias(
    parseQuizMarkdown(markdown),
    teacher === undefined ? undefined : parseTeacherAnswers(teacher),
    options,
  ).map((finding) => finding.rule);

Deno.test("equal option lengths give no bias findings", () => {
  assertEquals(
    rules(quiz(["A", equal()], ["B", equal()], ["C", equal()], ["D", equal()])),
    [],
  );
});

Deno.test("length bias fires above the threshold and not at it", () => {
  const longest = ["Aaaaaaa", "Bbbb", "Cccc", "Dddd"];
  // 2 of 5 = 40%: at the threshold, no finding.
  const atThreshold = quiz(
    ["A", longest],
    ["A", longest],
    ["B", equal()],
    ["C", equal()],
    ["D", equal()],
  );
  assertEquals(rules(atThreshold), []);
  // 2 of 4 = 50%: above the threshold.
  const above = quiz(["A", longest], ["A", longest], ["B", equal()], [
    "C",
    equal(),
  ]);
  assertEquals(rules(above), ["quiz-length-bias"]);
  // Fewer than four questions are never judged on length share.
  assertEquals(rules(quiz(["A", longest], ["A", longest], ["B", equal()])), []);
  // The threshold is configurable.
  assertEquals(rules(atThreshold, undefined, { maxLongestShare: 0.3 }), [
    "quiz-length-bias",
  ]);
});

Deno.test("a tie for longest does not count as the longest option", () => {
  const tie = ["Samee", "Samee", "Cccc", "Dddd"];
  assertEquals(rules(quiz(["A", tie], ["A", tie], ["B", tie], ["A", tie])), []);
});

Deno.test("reverse length bias fires when the correct option is the shortest", () => {
  const shortest = ["Aa", "Bbbbbb", "Cccccc", "Dddddd"];
  assertEquals(
    rules(
      quiz(["A", shortest], ["A", shortest], ["B", equal()], ["C", equal()]),
    ),
    ["quiz-reverse-length-bias"],
  );
});

Deno.test("length ratio is reported per question and ignores empty options", () => {
  const ratio = ["Aaaaaaaaaaaaaaaa", "Bb", "Cc", "Dd"];
  const found = checkQuizBias(
    parseQuizMarkdown(quiz(["A", ratio], ["B", equal()])),
  );
  assertEquals(found.map((f) => [f.rule, f.question]), [[
    "quiz-answer-length-ratio",
    1,
  ]]);
  // Exactly twice as long is allowed.
  assertEquals(
    rules(quiz(["A", ["Aaaa", "Bb", "Cc", "Dd"]], ["B", equal()])),
    [],
  );
  // An empty option is a syntax error reported elsewhere.
  assertEquals(rules(quiz(["A", ["Aaaa", "", "Cccc", "Dddd"]])), []);
});

Deno.test("signal-word options that are never correct are reported", () => {
  const giveaway = ["Aaaa", "Alleen B", "Cccc", "Dddd"];
  assertEquals(rules(quiz(["A", giveaway], ["B", equal()])), [
    "quiz-only-giveaway",
  ]);
  // Once a signal-word option is correct, the quiz is fine.
  assertEquals(rules(quiz(["A", giveaway], ["B", giveaway])), []);
  assertEquals(
    rules(quiz(["A", ["Aaaa", "Only B", "Cccc", "Dddd"]]), undefined, {
      giveawayWords: ["only"],
    }),
    ["quiz-only-giveaway"],
  );
});

Deno.test("position bias needs six questions and more than 45% for one letter", () => {
  const letters = (answers: string) =>
    quiz(
      ...[...answers].map((letter): [string, string[]] => [letter, equal()]),
    );
  assertEquals(rules(letters("BBBACD")), ["quiz-position-bias"]);
  assertEquals(rules(letters("BBACDA")), []);
  assertEquals(rules(letters("BBBAC")), []);
});

Deno.test("teacher answers are read from every documented layout", () => {
  const expected = new Map([[1, "B"], [2, "C"]]);
  for (
    const layout of [
      "1. **B**\n2. C\n",
      "## Vraag 1 — Correct: B\n\n## Vraag 2 — Correct: C\n",
      "## Vraag 1\nx\nCorrect antwoord: **B**\n\n## Vraag 2\nx\nCorrect antwoord: **C**\n",
      "| 1 | les 1.1 | B |\n| 2 | les 1.2 | **C** |\n",
      "| Vraag | Antwoord |\n|---|---|\n| 1 | B |\n| 2 | C |\n",
    ]
  ) assertEquals(parseTeacherAnswers(layout), expected, layout);
  assertEquals(parseTeacherAnswers("Nothing here"), new Map());
});

Deno.test("a teacher answer model that disagrees is an error; a missing one is fine", () => {
  const markdown = quiz(["A", equal()], ["B", equal()]);
  const found = checkQuizBias(
    parseQuizMarkdown(markdown),
    parseTeacherAnswers("| 1 | A |\n| 2 | C |\n"),
  );
  assertEquals(
    found.map((f) => [f.rule, f.severity, f.question]),
    [["quiz-answer-key-mismatch", "error", 2]],
  );
  assertEquals(rules(markdown), []);
  assertEquals(rules(markdown, "no recognised layout"), []);
});

Deno.test("lint reports bias as warnings for quiz files only", () => {
  const biased = quiz(
    ["A", ["Aaaaaaa", "Bbbb", "Cccc", "Dddd"]],
    ["A", ["Aaaaaaa", "Bbbb", "Cccc", "Dddd"]],
    ["B", equal()],
    ["C", equal()],
  );
  const diagnostics = lintMarkdown(biased, "quiz-x.md");
  assertEquals(diagnostics.map((d) => [d.rule, d.severity]), [[
    "quiz-length-bias",
    "warning",
  ]]);
  assertEquals(lintMarkdown(biased, "lesson.md"), []);
  const mismatch = lintMarkdown(quiz(["A", equal()]), "quiz-x.md", {
    teacherAnswers: "| 1 | B |\n",
  });
  assertEquals(mismatch.map((d) => [d.rule, d.severity]), [[
    "quiz-answer-key-mismatch",
    "error",
  ]]);
});
