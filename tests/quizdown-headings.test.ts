/**
 * QuizDown heading form (`## ? Question`, `## @ Assignment`) and option labels (#80, ADR 020).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { generateQtiXml } from "../src/quiz-converter.ts";
import {
  isQuizDown,
  parseQuizMarkdown,
  validateQuiz,
} from "../src/quiz-parser.ts";
import { lintQuizDown } from "../src/quizdown-lint.ts";

const headingQuiz = `# Quiz Design Patterns & UML

Some introduction text.

## Sectie zonder vraag

Text in a section is not a question.

## ? Welk UML diagram hoort bij het Decorator pattern?

- (x) a. Een \`wrapper\` die het onderdeel omhult
- ( ) b. Een **losse** klasse zonder relatie

## ? Welke uitspraken kloppen? (2 pt)

! Denk aan de relaties.

- [x] a. Het is een structureel patroon
- [ ] b. Het is een creatiepatroon
- [x] c. Het gebruikt compositie

## Nog een sectie

## @ Testen van FizzBuzz

Gedeelde code:

\`\`\`java
class FizzBuzz {}
\`\`\`

### ? Welke test is nuttig? (2 pt)

- (x) De test met 9
- ( ) De test op null

### ? Wat geeft 5? (1)

= Buzz ~10

## ? Een losse vraag na de opdracht

- (x) ja
- ( ) nee
`;

Deno.test("heading form: questions, sections and assignments with free titles", () => {
  assertEquals(isQuizDown(headingQuiz), true);
  const quiz = parseQuizMarkdown(headingQuiz);
  assertEquals(quiz.issues, []);
  assertEquals(quiz.title, "Quiz Design Patterns & UML");
  assertEquals(quiz.blocks?.map((block) => block.type), [
    "question",
    "question",
    "assignment",
    "question",
  ]);
  assertEquals(
    quiz.questions[0].text.split("\n")[0],
    "Welk UML diagram hoort bij het Decorator pattern?",
  );
  assertEquals(
    quiz.questions[0].title,
    "Welk UML diagram hoort bij het Decorator pattern?",
  );
  assertEquals(quiz.questions[0].options.map((o) => o.text), [
    "Een `wrapper` die het onderdeel omhult",
    "Een **losse** klasse zonder relatie",
  ]);
  assertEquals(quiz.questions[1].responseType, "multiple");
  assertEquals(quiz.questions[1].points, 2);
  assertEquals(quiz.questions[1].hint, "Denk aan de relaties.");
  const assignment = quiz.blocks![2];
  if (assignment.type !== "assignment") throw new Error("not an assignment");
  assertEquals(assignment.assignment.title, "Testen van FizzBuzz");
  assertStringIncludes(assignment.assignment.text, "class FizzBuzz {}");
  assertEquals(
    assignment.assignment.questions.map((
      q,
    ) => [q.label, q.responseType, q.points]),
    [["1a", "single", 2], ["1b", "open_short", 1]],
  );
  assertEquals(validateQuiz(quiz), []);
  assertEquals(lintQuizDown(headingQuiz), []);
  assertEquals(
    generateQtiXml(quiz, "quiz-test").match(/<section /g)?.length,
    3,
  );
});

Deno.test("heading form reports line numbers in the file", () => {
  const issues = lintQuizDown(
    "# Quiz\n\n## ? Vraag\n\n- (x) a\n- ( ) b\nstray text\n",
  );
  assertEquals(issues.map((i) => [i.rule, i.line]), [
    ["quizdown-unindented-option-content", 7],
  ]);
});

Deno.test("fenced form reports line numbers in the file, not in the block", () => {
  const issues = lintQuizDown(
    "# Quiz\n\nIntro\n\n```quiz\n? Q?\n- (x) a\n- ( ) b\nstray\n```\n",
  );
  assertEquals(issues.map((i) => [i.rule, i.line]), [
    ["quizdown-unindented-option-content", 9],
  ]);
});

const rules = (markdown: string) =>
  lintQuizDown(markdown).map((i) => `${i.rule}@${i.line}`);

Deno.test("heading form rejects a heading inside a question and a nested question", () => {
  assertEquals(
    rules("# Q\n\n## ? Vraag\n\n- (x) a\n- ( ) b\n\n### Toelichting\n"),
    ["quizdown-heading-in-question@8"],
  );
  assertEquals(
    rules("# Q\n\n## ? Vraag\n\n### ? Deelvraag\n\n- (x) a\n- ( ) b\n")
      .includes("quizdown-nested-question@5"),
    true,
  );
});

Deno.test("heading form needs a title on question and assignment headings", () => {
  assertEquals(
    rules("# Q\n\n## ?\n\n- (x) a\n- ( ) b\n").includes(
      "quizdown-heading-title@3",
    ),
    true,
  );
});

Deno.test("heading form: an assignment ends at a heading of its own level", () => {
  const quiz = parseQuizMarkdown(
    "# Q\n\n## @ Opdracht\n\nContext\n\n### ? A\n\n- (x) a\n- ( ) b\n\n## ? Los\n\n- (x) a\n- ( ) b\n",
  );
  assertEquals(quiz.blocks?.map((b) => b.type), ["assignment", "question"]);
});

Deno.test("headings inside fenced code are never structure", () => {
  const quiz = parseQuizMarkdown(
    "# Q\n\n## ? Vraag met code\n\n```md\n## ? not a question\n## @ nor this\n```\n\n- (x) a\n- ( ) b\n",
  );
  assertEquals(quiz.questions.length, 1);
  assertEquals(
    lintQuizDown("# Q\n\n## ? V\n\n```md\n## ? x\n```\n\n- (x) a\n- ( ) b\n"),
    [],
  );
});

Deno.test("legacy files without QuizDown markers are unaffected", () => {
  assertEquals(isQuizDown("# Quiz\n\n## Vraag 1\n\nText\n- A. x\n"), false);
});

Deno.test("option labels: matching labels are stripped, wrong ones are errors", () => {
  const ok = parseQuizMarkdown(
    "```quiz\n? Q?\n- (x) a. First\n- ( ) b) Second\n- ( ) Third\n```\n",
  );
  assertEquals(ok.issues, []);
  assertEquals(ok.questions[0].options.map((o) => o.text), [
    "First",
    "Second",
    "Third",
  ]);
  assertEquals(
    rules("```quiz\n? Q?\n- (x) b. First\n- ( ) a. Second\n```\n"),
    ["quizdown-option-label@3", "quizdown-option-label@4"],
  );
});
