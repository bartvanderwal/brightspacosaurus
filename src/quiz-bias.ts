/**
 * Detects patterns in multiple-choice quizzes that let students score without
 * knowing the material: length and position bias, signal words that give the
 * answer away, and answer keys that disagree with the teacher answer model.
 */
import type { ParsedQuiz } from "./quiz-parser.ts";

/** Thresholds for the quiz bias rules; all optional, defaults follow chance level. */
export interface QuizBiasOptions {
  /** Maximum share of questions where the correct option is the unique longest. */
  maxLongestShare?: number;
  /** Maximum share of questions where the correct option is the unique shortest. */
  maxShortestShare?: number;
  /** Maximum share of questions where one letter is correct. */
  maxLetterShare?: number;
  /** Maximum ratio between the correct option and the shortest option of a question. */
  maxLengthRatio?: number;
  /** Minimum number of questions before the length shares are checked. */
  minQuestionsForLength?: number;
  /** Minimum number of questions before the letter share is checked. */
  minQuestionsForPosition?: number;
  /** Lowercase words that start options and must not be wrong every time. */
  giveawayWords?: string[];
}

/** A quiz-level finding; `line` is one-based, 1 for findings about the whole quiz. */
export interface QuizBiasFinding {
  /** Stable rule identifier. */
  rule: string;
  /** One-based line of the question or 1 for the whole quiz. */
  line: number;
  /** Question number when the finding concerns a single question. */
  question?: number;
  /** Explanation of the finding. */
  message: string;
  /** Whether the finding makes the export wrong rather than weak. */
  severity: "error" | "warning";
}

/** Defaults: chance level is about 25% for longest, shortest and each letter. */
export const defaultQuizBiasOptions: Required<QuizBiasOptions> = {
  maxLongestShare: 0.40,
  maxShortestShare: 0.40,
  maxLetterShare: 0.45,
  maxLengthRatio: 2,
  minQuestionsForLength: 4,
  minQuestionsForPosition: 6,
  giveawayWords: ["alleen"],
};

const length = (text: string) => [...text].length;

/**
 * Reads the correct answer per question number from a teacher answer model.
 * Supports the five layouts used in owe-1: `1. **B**`, `## Vraag 1 — Correct: B`,
 * `## Vraag 1 … Correct antwoord: **B**`, `| 1 | les | B |` and `| 1 | B |`.
 */
export function parseTeacherAnswers(markdown: string): Map<number, string> {
  for (
    const pattern of [
      /^(\d+)\. \**([A-E])\**\s*$/gm,
      /^## Vraag (\d+) — Correct: ([A-E])/gm,
      /## Vraag (\d+)\n.*?Correct antwoord: \*\*([A-E])\*\*/gs,
      /^\| *(\d+) *\|[^|\n]*\| *\**([A-E])\** *\|/gm,
      /^\| *(\d+) *\| *\**([A-E])\** *\|/gm,
    ]
  ) {
    const found = new Map<number, string>();
    for (const [, number, letter] of markdown.matchAll(pattern)) {
      found.set(Number(number), letter);
    }
    if (found.size) return found;
  }
  return new Map();
}

/**
 * Checks a parsed quiz for bias. Questions without a recognised correct option
 * or with fewer than two options are skipped, as they are reported by `validateQuiz`.
 */
export function checkQuizBias(
  quiz: ParsedQuiz,
  teacherAnswers: Map<number, string> = new Map(),
  options: QuizBiasOptions = {},
): QuizBiasFinding[] {
  const limits = { ...defaultQuizBiasOptions, ...options };
  const questions = quiz.questions.filter((question) =>
    question.options.length >= 2 &&
    question.options.some((option) => option.label === question.correctAnswer)
  );
  const findings: QuizBiasFinding[] = [];
  const count = questions.length;
  let longest = 0;
  let shortest = 0;
  let giveawayOptions = 0;
  let giveawayCorrect = 0;
  const letters = new Map<string, number>();

  for (const question of questions) {
    const lengths = question.options.map((option) => ({
      label: option.label,
      size: length(option.text),
    }));
    const sizes = lengths.map((option) => option.size);
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    const correct = lengths.find((option) =>
      option.label === question.correctAnswer
    )!.size;
    letters.set(
      question.correctAnswer,
      (letters.get(question.correctAnswer) ?? 0) + 1,
    );
    if (correct === max && sizes.filter((size) => size === max).length === 1) {
      longest++;
    }
    if (correct === min && sizes.filter((size) => size === min).length === 1) {
      shortest++;
    }
    // An empty option is a syntax error that `validateQuiz` already reports.
    if (min > 0 && correct > limits.maxLengthRatio * min) {
      findings.push({
        rule: "quiz-answer-length-ratio",
        line: question.line ?? 1,
        question: question.number,
        message:
          `correct answer is more than ${limits.maxLengthRatio}x as long as the shortest option.`,
        severity: "warning",
      });
    }
    for (const option of question.options) {
      const text = option.text.trim().toLowerCase();
      if (limits.giveawayWords.some((word) => text.startsWith(word))) {
        giveawayOptions++;
        if (option.label === question.correctAnswer) giveawayCorrect++;
      }
    }
  }

  const quizLevel = (
    rule: string,
    message: string,
  ) => findings.push({ rule, line: 1, message, severity: "warning" });
  if (count >= limits.minQuestionsForLength) {
    if (longest / count > limits.maxLongestShare) {
      quizLevel(
        "quiz-length-bias",
        `correct answer is the longest option in ${longest}/${count} questions.`,
      );
    }
    if (shortest / count > limits.maxShortestShare) {
      quizLevel(
        "quiz-reverse-length-bias",
        `correct answer is the shortest option in ${shortest}/${count} questions.`,
      );
    }
  }
  if (giveawayOptions && !giveawayCorrect) {
    quizLevel(
      "quiz-only-giveaway",
      `${giveawayOptions} option(s) start with a signal word (${
        limits.giveawayWords.map((word) => `'${word}'`).join(", ")
      }) and none is correct; students learn to skip them.`,
    );
  }
  if (count >= limits.minQuestionsForPosition) {
    const [letter, times] = [...letters].sort((a, b) => b[1] - a[1])[0];
    if (times / count > limits.maxLetterShare) {
      quizLevel(
        "quiz-position-bias",
        `${letter} is correct in ${times}/${count} questions.`,
      );
    }
  }
  if (teacherAnswers.size) {
    for (const question of questions) {
      const teacher = teacherAnswers.get(question.number);
      if (teacher !== undefined && teacher !== question.correctAnswer) {
        findings.push({
          rule: "quiz-answer-key-mismatch",
          line: question.line ?? 1,
          question: question.number,
          message:
            `quiz says ${question.correctAnswer}, teacher answer model says ${teacher}.`,
          severity: "error",
        });
      }
    }
  }
  return findings;
}
