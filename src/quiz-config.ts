/** Quiz settings shared by CLI configuration and browser preview builds. */
import type { ResolvedQuizConfig } from "./types.ts";

/** Validate quiz settings and apply the same defaults for export and preview. */
export function resolveQuizOptions(value: unknown = {}): ResolvedQuizConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Field 'quiz' must be an object.");
  }
  const quiz = value as Record<string, unknown>;
  if (
    quiz.locale !== undefined &&
    quiz.locale !== "en" && quiz.locale !== "nl"
  ) {
    throw new Error("Field 'quiz.locale' must be 'en' or 'nl'.");
  }
  for (
    const field of [
      "assignmentPrefix",
      "questionPrefix",
      "subquestionPrefix",
    ] as const
  ) {
    if (
      quiz[field] !== undefined &&
      (typeof quiz[field] !== "string" || !quiz[field].trim())
    ) {
      throw new Error(
        `Field 'quiz.${field}' must be a non-empty string if provided.`,
      );
    }
  }
  if (
    quiz.maxAttempts !== undefined &&
    (typeof quiz.maxAttempts !== "number" ||
      !Number.isInteger(quiz.maxAttempts) || quiz.maxAttempts < 0)
  ) {
    throw new Error(
      "Field 'quiz.maxAttempts' must be a non-negative integer if it is provided.",
    );
  }
  if (
    quiz.shuffleAnswers !== undefined &&
    typeof quiz.shuffleAnswers !== "boolean"
  ) {
    throw new Error(
      "Field 'quiz.shuffleAnswers' must be a boolean if it is provided.",
    );
  }
  const locale = (quiz.locale as "en" | "nl" | undefined) ?? "en";
  return {
    maxAttempts: (quiz.maxAttempts as number | undefined) ?? 0,
    shuffleAnswers: (quiz.shuffleAnswers as boolean | undefined) ?? false,
    locale,
    assignmentPrefix: ((quiz.assignmentPrefix as string | undefined)?.trim()) ??
      (locale === "nl" ? "Opdracht" : "Assignment"),
    questionPrefix: ((quiz.questionPrefix as string | undefined)?.trim()) ??
      (locale === "nl" ? "Vraag" : "Question"),
    subquestionPrefix:
      ((quiz.subquestionPrefix as string | undefined)?.trim()) ??
        (locale === "nl" ? "Deelvraag" : "Subquestion"),
  };
}
