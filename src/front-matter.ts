/**
 * The one lesson front matter key BSO reads.
 *
 * Kept apart from the converter so the linter can use it without loading the
 * HTML pipeline.
 *
 * @module
 */

/**
 * `sidebar_position` from YAML front matter, as Docusaurus uses it to order a
 * page in its sidebar. BSO uses the same value for the Brightspace menu.
 */
export function readSidebarPosition(markdown: string): number | undefined {
  const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front) return undefined;
  const match = front[1].match(/^sidebar_position:\s*["']?(-?\d+(?:\.\d+)?)["']?\s*$/m);
  return match ? Number(match[1]) : undefined;
}
