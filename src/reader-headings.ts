/** Headings used by both the reader preview and PDF build. */
export interface ReaderHeading {
  depth: number;
  text: string;
}

export interface ReaderHeadingNumberIssue {
  heading: ReaderHeading;
  message: string;
}

interface LocatedHeading extends ReaderHeading {
  lineIndex: number;
  prefix: string;
  suffix: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const ATX_HEADING = /^(\s{0,3})(#{1,6})[ \t]+(.*?)[ \t]*$/;
const NUMERIC_PREFIX = /^(\d+(?:\.\d+)*)(?:[.)])?\s+/;
const EXEMPT_TITLES =
  /^(?:Bronnen|Sources|Literatuurlijst|Versiegeschiedenis)(?:\b|$)/i;
const APPENDIX_TITLE = /^(?:Bijlage|Appendix)\b/i;
const APPENDIX_LABEL = /^(?:Bijlage|Appendix)\s+([A-Z]+)(?:\b|[.:)]|$)/i;
const APPENDIX_HEADING =
  /^(Bijlage|Appendix)(?:\s+([A-Z]+)(?![A-Za-z]))?(?:[.:)]\s*|\s+)?(.*)$/i;

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

/** Whether YAML frontmatter explicitly opts this reader into shared numbering. */
export function readerSectionsNumberingEnabled(markdown: string): boolean {
  const frontmatter = markdown.match(FRONTMATTER)?.[1];
  return frontmatter !== undefined &&
    /^numberSections:\s*true\s*(?:#.*)?$/m.test(frontmatter);
}

function frontmatterEnd(markdown: string): number {
  return markdown.match(FRONTMATTER)?.[0].length ?? 0;
}

function findHeadings(markdown: string): LocatedHeading[] {
  const lines = markdown.split(/(?<=\n)/);
  const headings: LocatedHeading[] = [];
  let codeFence: { marker: string; length: number } | undefined;
  let beforeFrontmatter = frontmatterEnd(markdown);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const content = line.replace(/\r?\n$/, "");
    if (beforeFrontmatter > 0) {
      beforeFrontmatter -= line.length;
      continue;
    }

    const fence = content.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (codeFence) {
      if (
        fence && fence[1][0] === codeFence.marker[0] &&
        fence[1].length >= codeFence.length
      ) codeFence = undefined;
      continue;
    }
    if (fence) {
      codeFence = { marker: fence[1], length: fence[1].length };
      continue;
    }

    const atx = content.match(ATX_HEADING);
    if (atx) {
      let body = atx[3];
      const closing = body.match(/^(.*?)(?:[ \t]+#+[ \t]*)$/);
      let suffix = "";
      if (closing) {
        body = closing[1];
        suffix = closing[0].slice(closing[1].length);
      }
      headings.push({
        depth: atx[2].length,
        text: body,
        lineIndex: index,
        prefix: `${atx[1]}${atx[2]} `,
        suffix,
      });
      continue;
    }

    if (
      index + 1 < lines.length &&
      /^\s{0,3}(?:=+|-+)\s*$/.test(lines[index + 1].replace(/\r?\n$/, "")) &&
      content.trim()
    ) {
      const underline = lines[index + 1].trim();
      headings.push({
        depth: underline.startsWith("=") ? 1 : 2,
        text: content.trim(),
        lineIndex: index,
        prefix: "",
        suffix: "",
      });
    }
  }
  return headings;
}

function stripTypedNumber(text: string): string {
  return text.replace(NUMERIC_PREFIX, "").trimStart();
}

/**
 * Adds stable hierarchical numbers to ATX and Setext headings when opted in.
 * A single H1 is treated as the title; readers without one start at section 1.
 */
export function numberReaderHeadings(markdown: string): string {
  if (!readerSectionsNumberingEnabled(markdown)) return markdown;

  const headings = findHeadings(markdown);
  if (headings.length === 0) return markdown;
  const minDepth = Math.min(...headings.map((heading) => heading.depth));
  const minDepthHeadings = headings.filter((heading) =>
    heading.depth === minDepth
  );
  const hasTitle = minDepth === 1 && minDepthHeadings.length === 1;
  const title = hasTitle ? minDepthHeadings[0] : undefined;
  const firstNumberedDepth = hasTitle ? minDepth : minDepth - 1;
  const counters: number[] = [];
  let appendixNumber = 0;
  const replacements = new Map<number, string>();

  for (const heading of headings) {
    const cleanText = stripTypedNumber(heading.text);
    const backMatterText = cleanText.replace(/^[A-Z][.)]?\s+/i, "");
    if (heading === title) {
      if (cleanText !== heading.text) {
        replacements.set(
          heading.lineIndex,
          `${heading.prefix}${cleanText}${heading.suffix}`,
        );
      }
      continue;
    }

    if (EXEMPT_TITLES.test(backMatterText)) {
      if (backMatterText !== heading.text) {
        replacements.set(
          heading.lineIndex,
          `${heading.prefix}${backMatterText}${heading.suffix}`,
        );
      }
      continue;
    }

    const appendix = cleanText.match(APPENDIX_HEADING);
    if (appendix) {
      appendixNumber++;
      const rest = appendix[3].trim();
      const appendixHeading = `${appendix[1]} ${appendixLabel(appendixNumber)}${
        rest ? `: ${rest}` : ""
      }`;
      replacements.set(
        heading.lineIndex,
        `${heading.prefix}${appendixHeading}${heading.suffix}`,
      );
      continue;
    }

    const level = Math.max(1, heading.depth - firstNumberedDepth);
    counters.length = level;
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    const number = counters.filter((value) => value > 0).join(".");
    replacements.set(
      heading.lineIndex,
      `${heading.prefix}${number} ${cleanText}${heading.suffix}`,
    );
  }

  if (replacements.size === 0) return markdown;
  const lines = markdown.split(/(?<=\n)/);
  for (const [index, replacement] of replacements) {
    const lineEnding = lines[index].match(/\r?\n$/)?.[0] ?? "";
    lines[index] = `${replacement}${lineEnding}`;
  }
  return lines.join("");
}

/**
 * Checks manually numbered reader headings. Unnumbered headings may occur
 * between numbered ones; the next explicit number must still be consecutive.
 */
export function checkReaderHeadingNumbers(
  headings: ReaderHeading[],
): ReaderHeadingNumberIssue[] {
  const issues: ReaderHeadingNumberIssue[] = [];
  const numberSequences = new Map<number, number[]>();
  let previousAppendix: string | undefined;

  for (const heading of headings) {
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

    if (!numberMatch) continue;
    const number = numberMatch[1].replace(/\.$/, "");
    const parts = number.split(".").map(Number);
    const hasZero = parts.some((part) => part === 0);
    if (hasZero) {
      issues.push({
        heading,
        message: "Section numbers must not contain a zero level.",
      });
    }
    const previous = numberSequences.get(heading.depth);
    if (!hasZero && previous) {
      let commonPrefix = 0;
      while (
        commonPrefix < previous.length && commonPrefix < parts.length &&
        previous[commonPrefix] === parts[commonPrefix]
      ) commonPrefix++;
      if (commonPrefix === previous.length && commonPrefix === parts.length) {
        issues.push({
          heading,
          message: `Section number ${number} repeats.`,
        });
      } else if (commonPrefix === parts.length) {
        issues.push({
          heading,
          message: `Section number ${number} repeats or goes backwards after ${
            previous.join(".")
          }.`,
        });
      } else {
        const expected = commonPrefix < previous.length
          ? previous[commonPrefix] + 1
          : 1;
        const value = parts[commonPrefix];
        if (value !== expected) {
          issues.push({
            heading,
            message: value > expected
              ? `Expected section number ${expected} after ${
                previous.join(".")
              }, found ${number}.`
              : `Section number ${number} repeats or goes backwards after ${
                previous.join(".")
              }.`,
          });
        } else {
          for (let index = commonPrefix + 1; index < parts.length; index++) {
            if (parts[index] !== 1) {
              issues.push({
                heading,
                message: `Expected section number 1 after ${
                  parts.slice(0, index).join(".")
                }, found ${parts[index]}.`,
              });
              break;
            }
          }
        }
      }
    }
    numberSequences.set(heading.depth, parts);
  }

  return issues;
}
