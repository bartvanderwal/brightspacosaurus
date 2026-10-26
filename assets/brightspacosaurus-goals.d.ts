/**
 * Side-effect module for the learning goals script (#167). It runs as a classic script in
 * Brightspace pages and defines `globalThis.bsoGoals` with `initializeGoals` and `goalKey`.
 * A Docusaurus client module imports it and calls
 * `globalThis.bsoGoals?.initializeGoals(document)` in `onRouteDidUpdate`.
 *
 * @module
 */
export {};
