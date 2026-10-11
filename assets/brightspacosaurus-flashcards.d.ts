/**
 * Side-effect module for the flashcards script (#86). It runs as a classic script in
 * Brightspace pages and defines `globalThis.bsoFlashcards` with `initializeFlashcards`.
 * A Docusaurus client module imports it and calls
 * `globalThis.bsoFlashcards?.initializeFlashcards(document)` in `onRouteDidUpdate`.
 */
export {};
