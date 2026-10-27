/**
 * Side-effect module for the learning objectives script. It runs as a classic script in
 * Brightspace pages and defines `globalThis.bsoObjectives` with `initializeObjectives` and `objectiveKey`.
 * A Docusaurus client module imports it and calls
 * `globalThis.bsoObjectives?.initializeObjectives(document)` in `onRouteDidUpdate`.
 *
 * @module
 */
export {};
