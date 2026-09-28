import { initializeQuizzes } from "../../assets/brightspacosaurus-quizzes.js";
import { initializeFlashcards } from "../../assets/brightspacosaurus-flashcards.js";

// Docusaurus invokes this after hydration and after client-side page changes.
export function onRouteDidUpdate() {
  initializeFlashcards(document);
  initializeQuizzes(document);
}
