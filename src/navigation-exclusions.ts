/**
 * Which files stay out of the course menu. Kept free of imports: the Docusaurus
 * preview loads `manifest-builder.ts` in Node, which cannot resolve JSR
 * packages such as `@std/path`.
 *
 * @module
 */

/** Transcripts and teacher answer files never appear as a page in the menu. */
export function isNavigationExcludedFile(fileName: string): boolean {
  const name = fileName.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  return name.startsWith("transcript-") || name.includes("-antwoorden-docent");
}
