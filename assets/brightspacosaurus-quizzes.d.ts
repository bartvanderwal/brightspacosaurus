/**
 * Side-effect module for the quizzes script (#86). It runs as a classic script in
 * Brightspace pages and defines `globalThis.bsoQuizzes` with `initializeQuizzes`, `shuffleOptions`.
 * A Docusaurus client module imports it and calls
 * `globalThis.bsoQuizzes?.initializeQuizzes(document)` in `onRouteDidUpdate`.
 */
export {};
