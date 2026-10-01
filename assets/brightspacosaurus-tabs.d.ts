/**
 * Side-effect module for the teacher-page tabs (#37). It runs as a classic
 * script in Brightspace pages and defines `globalThis.bsoTabs.initializeTabs`.
 * A Docusaurus client module imports it and calls
 * `globalThis.bsoTabs?.initializeTabs(document)` in `onRouteDidUpdate`.
 */
export {};
