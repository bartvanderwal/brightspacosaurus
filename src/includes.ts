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

/**
 * Why a file is not a slide deck, or undefined when it is one. A file that a
 * `slides.lessons` setting selects as a deck must not be skipped silently, so
 * the preview, the build and `bso lint` all report this reason. The rules are
 * deliberately strict: one unquoted `slides: true` (or `marp: true`) in the
 * front matter, and nothing that looks like prose or malformed YAML.
 */
export function deckProblem(text: string): string | undefined {
  const match = text.match(
    /^(?:\uFEFF)?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/,
  );
  if (!match) return "it has no front matter with 'slides: true'";
  const lines = match[1].split("\n");
  const markers = lines.filter((line) => /^(?:marp|slides)[ \t]*:/.test(line));
  if (!markers.length) {
    return "its front matter has neither 'slides: true' nor 'marp: true'";
  }
  if (markers.length > 1) {
    return "its front matter has more than one of 'slides' and 'marp'; use only 'slides: true'";
  }
  if (!/^(?:marp|slides)[ \t]*:[ \t]+true[ \t]*(?:#.*)?$/.test(markers[0])) {
    return `'${markers[0].trim()}' must be the unquoted value true`;
  }
  if (
    lines.some((line) =>
      line.trim() && !/^(?:[ \t]+|#|[A-Za-z_][\w-]*[ \t]*:)/.test(line)
    )
  ) return "its front matter has prose or malformed top-level YAML";
  return undefined;
}

/**
 * True when the front matter has more than one of `slides` and `marp`. Which of
 * the two makes the deck is then unclear, so the deck is an error and not
 * skipped without a word.
 */
export function deckMarkerConflict(text: string): boolean {
  const match = text.match(
    /^(?:\uFEFF)?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/,
  );
  if (!match) return false;
  const lines = match[1].split("\n");
  return lines.some((line) => /^slides[ \t]*:/.test(line)) &&
    lines.some((line) => /^marp[ \t]*:/.test(line));
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
 * detecting cycles. A slide deck's front matter is dropped; the included
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
