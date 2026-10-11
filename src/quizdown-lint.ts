/**
 * Standalone QuizDown linter (ADR 020).
 *
 * It depends only on the QuizDown parser, so any Quizzosaurus client can lint a
 * quiz without BSO. `bso lint` calls it for quiz files that contain QuizDown,
 * so BSO users run one linter.
 *
 * @module
 */

import {
  isQuizDown,
  parseQuizMarkdown,
  type QuizIssue,
  validateQuiz,
} from "./quiz-parser.ts";

/** Legacy question or assignment headings outside the fenced `quiz` block. */
function legacyHeadingLines(markdown: string): number[] {
  const lines: number[] = [];
  let fence: { character: string; length: number } | undefined;
  for (const [index, raw] of markdown.split(/\r?\n/).entries()) {
    const opening = raw.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (opening) {
      if (!fence) {
        fence = { character: opening[1][0], length: opening[1].length };
      } else if (
        opening[1][0] === fence.character &&
        opening[1].length >= fence.length && !opening[2].trim()
      ) {
        fence = undefined;
      }
      continue;
    }
    if (
      !fence &&
      /^#{2,3}\s+(?:Vraag|Question|Opdracht|Assignment)\s+\d+\b/i.test(raw)
    ) {
      lines.push(index + 1);
    }
  }
  return lines;
}

/**
 * Lint QuizDown Markdown. Returns no issues for a file that holds no QuizDown
 * block: the legacy format is linted by `validateQuiz` as before.
 *
 * Anything the parser would have to guess is an `error`; `warning` is for style.
 */
export function lintQuizDown(markdown: string): QuizIssue[] {
  if (!isQuizDown(markdown)) return [];
  const quiz = parseQuizMarkdown(markdown);
  const issues = validateQuiz(quiz).map((issue) => ({
    ...issue,
    severity: issue.severity ?? "error" as const,
  }));
  for (const block of quiz.blocks ?? []) {
    if (block.type === "assignment" && !block.assignment.text.trim()) {
      issues.push({
        rule: "quizdown-assignment-no-context",
        line: block.assignment.line ?? 1,
        message:
          `Assignment '${block.assignment.title}' has no shared context; without it the sub-questions could be standalone questions.`,
        severity: "warning",
      });
    }
  }
  for (const question of quiz.questions) {
    // A number alone is no name: it says nothing to a teacher who looks for the question.
    if (question.title && !/\p{L}/u.test(question.title)) {
      issues.push({
        rule: "quizdown-question-name",
        line: question.line ?? 1,
        question: question.number,
        message:
          `The question has no name: '${question.title}' is only a number. Give it a name, for example '## ? ${question.number}. Generated interface'.`,
        severity: "warning",
      });
    }
  }
  for (const line of legacyHeadingLines(markdown)) {
    issues.push({
      rule: "quizdown-mixed-formats",
      line,
      message:
        "This file has a QuizDown block and a legacy '## Vraag' heading. Use one format per file.",
      severity: "error",
    });
  }
  return issues;
}
