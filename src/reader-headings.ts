/** Headings used by both the reader preview and PDF build. */
export interface ReaderHeading {
  depth: number;
  text: string;
}

export interface ReaderHeadingNumberIssue {
  heading: ReaderHeading;
  message: string;
}

const NUMERIC_PREFIX = /^(\d+(?:\.\d+)*)(?:[.)])?\s+/;
const EXEMPT_TITLES =
  /^(?:Bronnen|Sources|Literatuurlijst|Versiegeschiedenis|Bijlagen|Appendices)(?:\b|$)/i;
const APPENDIX_TITLE = /^(?:Bijlage|Appendix)\b/i;
const APPENDIX_LABEL = /^(?:Bijlage|Appendix)\s+([A-Z]+)(?:\b|[.:)]|$)/i;

function appendixLabel(index: number): string {
  let label = "";
  for (; index > 0; index = Math.floor((index - 1) / 26)) {
    label = String.fromCharCode(65 + (index - 1) % 26) + label;
  }
  return label;
}

function appendixIndex(label: string): number {
  return [...label].reduce(
    (index, letter) => index * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

// The whole heading, not a heading that merely starts with the word:
// '7.4 Referenties naar online bronnen' is a section about references, not the reference list.
const SOURCES_TITLES =
  /^(?:Bronnen|Sources|Literatuurlijst|Referenties|References)\s*[:.]?$/i;

/**
 * Whether a heading is a list of sources (Sources, Bronnen, References, ...),
 * with or without a number in front of it. Sources are never numbered (APA
 * puts the reference list after the text, as an unnumbered section).
 */
export function isSourcesHeading(text: string): boolean {
  return SOURCES_TITLES.test(text.trim().replace(NUMERIC_PREFIX, ""));
}

/** Whether a heading starts with a section number such as `1.` or `2.3`. */
export function hasSectionNumber(text: string): boolean {
  return NUMERIC_PREFIX.test(text.trim());
}

/** Whether a reader explicitly opts out of required manual heading numbers. */
export function readerHeadingNumberLintEnabled(markdown: string): boolean {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  return !frontmatter ||
    !/^lintHeadingNumbers:\s*false\s*(?:#.*)?$/m.test(frontmatter);
}

/**
 * Checks manual reader heading numbers. A single H1 is treated as the reader
 * title. Other section headings require consecutive hierarchical numbers.
 */
export function checkReaderHeadingNumbers(
  headings: ReaderHeading[],
): ReaderHeadingNumberIssue[] {
  const issues: ReaderHeadingNumberIssue[] = [];
  let previousAppendix: string | undefined;
  const h1Headings = headings.filter((heading) => heading.depth === 1);
  const title = h1Headings.length === 1 ? h1Headings[0] : undefined;
  const firstSectionDepth = title
    ? 2
    : Math.min(...headings.map((heading) => heading.depth));
  const counters: number[] = [];

  for (const heading of headings) {
    if (heading === title) continue;

    const text = heading.text.trim();
    const numberMatch = text.match(NUMERIC_PREFIX);
    const contentWithoutNumber = text.replace(NUMERIC_PREFIX, "");
    const letterMatch = contentWithoutNumber.match(/^[A-Z][.)]?\s+/i);
    const contentWithoutLabel = contentWithoutNumber.replace(
      /^[A-Z][.)]?\s+/i,
      "",
    );
    if (EXEMPT_TITLES.test(contentWithoutLabel)) {
      if (numberMatch || letterMatch || APPENDIX_LABEL.test(text)) {
        issues.push({
          heading,
          message:
            "Back-matter headings must not have a section number or appendix letter.",
        });
      }
      continue;
    }

    if (APPENDIX_TITLE.test(contentWithoutNumber)) {
      const appendix = contentWithoutNumber.match(APPENDIX_LABEL)?.[1]
        ?.toUpperCase();
      if (!appendix || numberMatch) {
        issues.push({
          heading,
          message: numberMatch
            ? "Appendix headings must use a letter, not a section number."
            : "Appendix headings must use an ordered letter (A, B, ...).",
        });
        continue;
      }
      if (previousAppendix) {
        const expected = appendixLabel(appendixIndex(previousAppendix) + 1);
        if (appendix !== expected) {
          issues.push({
            heading,
            message:
              `Expected appendix ${expected} after ${previousAppendix}, found ${appendix}.`,
          });
        }
      } else if (appendix !== "A") {
        issues.push({
          heading,
          message: `Expected appendix A, found ${appendix}.`,
        });
      }
      previousAppendix = appendix;
      continue;
    }

    const level = Math.max(1, heading.depth - firstSectionDepth + 1);
    for (let index = 0; index < level - 1; index++) {
      if (counters[index] === undefined) counters[index] = 1;
    }
    const expectedParts = counters.slice(0, level);
    expectedParts[level - 1] = (expectedParts[level - 1] ?? 0) + 1;
    const expected = expectedParts.join(".");

    if (!numberMatch) {
      issues.push({
        heading,
        message:
          `Reader section headings must have a manual hierarchical number (expected ${expected}); use \`lintHeadingNumbers: false\` in frontmatter to opt out.`,
      });
      counters[level - 1] = expectedParts[level - 1];
      counters.length = level;
      continue;
    }

    const number = numberMatch[1].replace(/\.$/, "");
    const parts = number.split(".").map(Number);
    if (parts.some((part) => part === 0)) {
      issues.push({
        heading,
        message: "Section numbers must not contain a zero level.",
      });
    } else if (number !== expected) {
      issues.push({
        heading,
        message: `Expected section number ${expected}, found ${number}.`,
      });
    }
    for (let index = 0; index < level; index++) {
      counters[index] = parts[index] ?? expectedParts[index];
    }
    counters.length = level;
  }

  return issues;
}
