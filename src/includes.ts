/**
 * Expands `{@include: [link text](path)}` directives. Runtime-neutral (no Deno
 * or Node APIs) so the Brightspace export and the Docusaurus preview share it.
 *
 * @module
 */

const INCLUDE_LINE_REGEX = /^\{@include:\s*(.+?)\s*\}$/;
const MAX_INCLUDE_DEPTH = 10;

/** File-system operations needed to expand includes. */
export interface IncludeHost {
  /** Resolves an include target relative to the including file's directory. */
  resolve(fromDir: string, target: string): string;
  /** Returns the directory of a file path. */
  dirname(path: string): string;
  /** Returns file content, or null when the file cannot be read. */
  readFile(path: string): string | null;
  /** Receives a message for includes that cannot be resolved. */
  warn(message: string): void;
}

/**
 * Extracts the include target from an `{@include: [link text](path)}`
 * directive. The directive content must be a Markdown link, so the include
 * target stays a clickable, valid Markdown link when authors read the
 * source directly (e.g. in VS Code).
 *
 * Issue: #26
 */
export function parseIncludeTarget(
  directiveContent: string,
  line: string,
): string {
  const linkMatch = directiveContent.match(/^\[[^\]]*\]\(([^)]+)\)$/);
  if (!linkMatch) {
    const err = new Error(
      `{@include: ...} requires Markdown link syntax, e.g. {@include: [link text](${directiveContent})}. Found: "${line}"`,
    );
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }
  return linkMatch[1];
}

/**
 * Replaces include directives on their own line with the referenced file's
 * content, recursively. Cycles are not detected; depth is bounded at 10.
 * Unreadable targets are kept as-is and reported via `host.warn`.
 */
export function expandIncludes(
  markdown: string,
  sourceDir: string,
  host: IncludeHost,
  depth = 0,
): string {
  if (depth > MAX_INCLUDE_DEPTH) return markdown;
  return markdown.split("\n").map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(INCLUDE_LINE_REGEX);
    if (!match) return line;
    const includePath = host.resolve(
      sourceDir,
      parseIncludeTarget(match[1], trimmed),
    );
    const content = host.readFile(includePath);
    if (content === null) {
      host.warn(`resolveIncludes: file not found: ${includePath}`);
      return line;
    }
    return expandIncludes(content, host.dirname(includePath), host, depth + 1);
  }).join("\n");
}

/** True for a file that starts with a YAML front matter block marking a slide deck. */
export function isSlideDeck(markdown: string): boolean {
  const header = markdown.replace(/^\uFEFF/, "").match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  )?.[1];
  return header !== undefined &&
    /^(?:slides|marp)[ \t]*:[ \t]*true\b/m.test(header);
}

/** Removes a leading YAML front matter block. */
function withoutFrontMatter(markdown: string): string {
  return markdown.replace(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
    "",
  );
}

/**
 * Expands `{@include}` directives for slides, **one level deep**: the included
 * file is placed as it is, and an include inside it stays a directive. That
 * rules out endless embedding between files that refer to each other, without
 * detecting cycles (#143). A deck's front matter is dropped; the included
 * text is trimmed, so a `---` slide separator belongs in the including file.
 * `rewrite` can adapt the included text, for example relative image paths.
 */
export function expandIncludesOnce(
  markdown: string,
  sourceDir: string,
  host: IncludeHost,
  rewrite: (content: string, includeDir: string) => string = (c) => c,
): string {
  return markdown.split("\n").map((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(INCLUDE_LINE_REGEX);
    if (!match) return line;
    const includePath = host.resolve(
      sourceDir,
      parseIncludeTarget(match[1], trimmed),
    );
    const content = host.readFile(includePath);
    if (content === null) {
      host.warn(`resolveIncludes: file not found: ${includePath}`);
      return line;
    }
    return rewrite(
      withoutFrontMatter(content.replace(/\r\n/g, "\n")).trim(),
      host.dirname(includePath),
    );
  }).join("\n");
}
