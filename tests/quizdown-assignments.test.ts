/**
 * QuizDown assignments (`@`) with typed, scored sub-questions, and the
 * standalone QuizDown linter (ADR 020, #80).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { generateQtiXml } from "../src/quiz-converter.ts";
import { parseQuizMarkdown, validateQuiz } from "../src/quiz-parser.ts";
import { lintQuizDown } from "../src/quizdown-lint.ts";

const assignmentQuiz = `# Quiz FizzBuzz

\`\`\`\`quiz
? A standalone question before the assignment. (1 pt)
- ( ) Yes
- (x) No

@ Tests for FizzBuzz
Given the class:

\`\`\`java
class FizzBuzz { String of(int n) { return ""; } }
\`\`\`

- [ ] this list is shared context, not an option
! neither is this line

? Which tests are **useful**? (2 pt)
- [x] \`of(3)\` returns Fizz
- [ ] \`of(0)\` returns null
- [x] \`of(15)\` returns FizzBuzz

? Name the technique. (3)
= boundary value / edge case ~30

? Which one?
- (x) First
- ( ) Second
\`\`\`\`
`;

Deno.test("QuizDown assignment groups typed, scored sub-questions with shared context", () => {
  const quiz = parseQuizMarkdown(assignmentQuiz);
  assertEquals(quiz.issues, []);
  assertEquals(quiz.blocks?.map((block) => block.type), [
    "question",
    "assignment",
  ]);
  const assignment = quiz.blocks![1];
  if (assignment.type !== "assignment") throw new Error("not an assignment");
  assertEquals(assignment.assignment.title, "Tests for FizzBuzz");
  assertStringIncludes(assignment.assignment.text, "class FizzBuzz");
  assertStringIncludes(assignment.assignment.text, "- [ ] this list is shared");
  assertStringIncludes(assignment.assignment.text, "! neither is this line");
  assertEquals(
    assignment.assignment.questions.map((
      q,
    ) => [q.label, q.responseType, q.points]),
    [["1a", "multiple", 2], ["1b", "open_short", 3], [
      "1c",
      "single",
      undefined,
    ]],
  );
  assertEquals(quiz.questions.length, 4);
  assertEquals(quiz.questions[0].points, 1);
  assertEquals(
    quiz.questions[0].text,
    "A standalone question before the assignment.",
  );
  assertEquals(validateQuiz(quiz), []);
});

Deno.test("QuizDown assignment becomes a QTI section with the shared text once", () => {
  const xml = generateQtiXml(parseQuizMarkdown(assignmentQuiz), "quiz-test");
  assertEquals(xml.match(/<section /g)?.length, 2);
  assertEquals(xml.match(/class FizzBuzz/g)?.length, 1);
});

Deno.test("lintQuizDown accepts a valid assignment quiz and ignores legacy files", () => {
  assertEquals(lintQuizDown(assignmentQuiz), []);
  assertEquals(lintQuizDown("# Quiz\n\n## Vraag 1\n\nText\n- A. x\n"), []);
});

const rules = (markdown: string) =>
  lintQuizDown(markdown).map((issue) => `${issue.rule}:${issue.severity}`);

Deno.test("lintQuizDown reports an assignment without sub-questions", () => {
  assertEquals(
    rules("```quiz\n@ Empty\nSome context\n```\n").includes(
      "quiz-assignment-empty:error",
    ),
    true,
  );
});

Deno.test("lintQuizDown reports invalid point spellings as errors", () => {
  for (const bad of ["(2 punten)", "(2 pts)", "(2 points)", "(2,5 pt)"]) {
    assertEquals(
      rules(`\`\`\`quiz\n? Which? ${bad}\n- (x) a\n- ( ) b\n\`\`\`\n`),
      ["quiz-points-syntax:error"],
      bad,
    );
  }
});

Deno.test("lintQuizDown reports unindented content after an option", () => {
  assertEquals(
    rules(
      "````quiz\n? Which?\n- (x) a\n```java\ncode\n```\n- ( ) b\n````\n",
    ),
    ["quizdown-unindented-option-content:error"],
  );
});

Deno.test("lintQuizDown warns about an assignment without shared context", () => {
  assertEquals(
    rules("```quiz\n@ Group\n? Which?\n- (x) a\n- ( ) b\n```\n"),
    ["quizdown-assignment-no-context:warning"],
  );
});

Deno.test("lintQuizDown rejects mixing legacy headings and a QuizDown block", () => {
  assertEquals(
    rules(
      "# Quiz\n\n## Vraag 1\n\nx\n- A. a\nCorrect antwoord: A\n\n```quiz\n? Q?\n- (x) a\n- ( ) b\n```\n",
    ).includes("quizdown-mixed-formats:error"),
    true,
  );
});

Deno.test("a QuizDown block must start with a question or an assignment", () => {
  assertEquals(
    rules("```quiz\nsome text\n```\n").includes("quiz-question:error"),
    true,
  );
});
