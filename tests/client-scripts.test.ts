/**
 * The quiz and flashcard scripts are classic scripts in Brightspace and side-effect
 * modules in a bundler (#86): importing them must define the global API.
 */
import { assertEquals } from "@std/assert";

Deno.test("importing the quiz script defines globalThis.bsoQuizzes (#86)", async () => {
  await import("../assets/brightspacosaurus-quizzes.js");
  const api = (globalThis as Record<string, unknown>).bsoQuizzes as Record<
    string,
    unknown
  >;
  assertEquals(typeof api.initializeQuizzes, "function");
  assertEquals(typeof api.shuffleOptions, "function");
});

Deno.test("importing the flashcards script defines globalThis.bsoFlashcards (#86)", async () => {
  await import("../assets/brightspacosaurus-flashcards.js");
  const api = (globalThis as Record<string, unknown>).bsoFlashcards as Record<
    string,
    unknown
  >;
  assertEquals(typeof api.initializeFlashcards, "function");
});
