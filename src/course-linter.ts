/**
 * Offline checks for BSO-specific Markdown, complementary to Markdown style linters.
 *
 * @module
 */
import { deckMarkerConflict, isSlideDeck } from "./includes.ts";
import { findDeckLinks, findMarkdownLinks } from "./linked-decks.ts";
import { isLeadPageName, planMenu } from "./menu-plan.ts";
import { sectionsWithoutSlideContent } from "./lesson-slides.ts";
import {
  findEmptySlideSeparators,
  headingDividerLevels,
} from "./slide-separators.ts";
import {
  basename,
  dirname,
  globToRegExp,
  isAbsolute,
  join,
  relative,
  resolve,
} from "@std/path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import {
  type FlashcardsConfig,
  isFlashcardList,
  normalizeSectionHeading,
  resolveFlashcardsOptions,
} from "./flashcards.ts";
import remarkDirective from "remark-directive";
import { detectDiagramIssues } from "./diagram-validation.ts";
import { readSidebarPosition } from "./front-matter.ts";
import { isQuizDown, parseQuizMarkdown, validateQuiz } from "./quiz-parser.ts";
import { lintQuizDown } from "./quizdown-lint.ts";
import { quizDiagramFields } from "./quiz-diagram-fields.ts";
import { resolveQuizOptions } from "./quiz-config.ts";
import type { QuizHeadingOptions } from "./quiz-parser.ts";
import {
  checkQuizBias,
  parseTeacherAnswers,
  type QuizBiasOptions,
} from "./quiz-bias.ts";
import { parseIncludeTarget } from "./markdown-converter.ts";
import { scanSources } from "./source-scanner.ts";
import type { ResolvedConfig, SlidesConfig } from "./types.ts";
import {
  checkReaderHeadingNumbers,
  hasSectionNumber,
  isSourcesHeading,
  readerHeadingNumberLintEnabled,
} from "./reader-headings.ts";
import {
  findDownloadableLinks,
  MAX_DOWNLOADABLE_FILE_SIZE,
  resolveDownloadableFile,
} from "./downloadable-files.ts";
import type { DownloadableLink } from "./downloadable-files.ts";

/** A source-located authoring problem, with a stable rule identifier. */
export interface LintDiagnostic {
  /** Source file being checked. */
  sourceFile: string;
  /** One-based source line. */
  line: number;
  /** One-based source column. */
  column: number;
  /** Errors prevent a successful lint result; warnings are advisory. */
  severity: "error" | "warning";
  /** Stable rule identifier suitable for editor integrations. */
  rule: string;
  /** Explanation with guidance for fixing the source. */
  message: string;
}

/** Files and diagnostics from a read-only course scan. */
export interface LintResult {
  /** Number of Markdown files checked, including linked include files. */
  filesChecked: number;
  /** Diagnostics ordered by file, line, column and rule. */
  diagnostics: LintDiagnostic[];
  /** Scanned directories (relative to the repository root) and their Markdown file counts. */
  directories: { dir: string; files: number }[];
  /** Files checked only because another file includes them. */
  includedFiles: number;
}

/** Options shared by single-file and course linting. */
export interface LintOptions extends QuizHeadingOptions {
  /** Headings whose content must consist solely of term/definition lists. */
  flashcards?: FlashcardsConfig;
  /**
   * The file is a lesson page (not a reader, quiz or include), where YAML
   * frontmatter is not processed.
   */
  lessonFile?: boolean;
  /** Thresholds for the quiz bias rules. */
  quizBias?: QuizBiasOptions;
  /** Content of the teacher answer model that belongs to a quiz file. */
  teacherAnswers?: string;
  /** This is an index page for a first-level course module. */
  moduleIndex?: boolean;
  /** The lesson is turned into slides (`slides.lessons` or `slides.generateForPrefix`). */
  generatedSlides?: boolean;
}

interface Node {
  type: string;
  name?: string;
  depth?: number;
  value?: string;
  url?: string;
  children?: Node[];
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface Include {
  target: string;
  line: number;
  column: number;
}

function nodeText(node: Node): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function collectHeadingNodes(node: Node, headings: Node[]): void {
  if (node.type === "heading") headings.push(node);
  for (const child of node.children ?? []) collectHeadingNodes(child, headings);
}

function compareDiagnostics(a: LintDiagnostic, b: LintDiagnostic): number {
  const compare = (x: string, y: string) => x < y ? -1 : x > y ? 1 : 0;
  return compare(a.sourceFile, b.sourceFile) || a.line - b.line ||
    a.column - b.column || compare(a.rule, b.rule);
}

const quizBlockHtmlTags = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "meta",
  "nav",
  "noembed",
  "noframes",
  "noscript",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "plaintext",
  "pre",
  "search",
  "section",
  "script",
  "style",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "title",
  "track",
  "tr",
  "ul",
  "xmp",
]);

function unsupportedQuizHtmlBlocks(markdown: string): {
  tag: string;
  line: number;
}[] {
  const found: { tag: string; line: number }[] = [];
  let quizFence: { character: string; length: number } | undefined;
  let codeFence: { character: string; length: number } | undefined;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const opening = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    const closing = line.match(/^\s*(`+|~+)\s*$/);
    if (codeFence) {
      if (
        closing?.[1][0] === codeFence.character &&
        closing[1].length >= codeFence.length
      ) codeFence = undefined;
      continue;
    }
    if (
      quizFence && closing?.[1][0] === quizFence.character &&
      closing[1].length >= quizFence.length
    ) {
      quizFence = undefined;
      continue;
    }
    if (opening) {
      if (!quizFence && /^\s*(?:quiz|quizz)(?:\s|$)/i.test(opening[2])) {
        quizFence = { character: opening[1][0], length: opening[1].length };
      } else {
        codeFence = { character: opening[1][0], length: opening[1].length };
      }
      continue;
    }
    for (
      const match of line.replace(/(`+).*?\1/g, "").matchAll(
        /<([a-z][\w-]*)\b[^>]*>/gi,
      )
    ) {
      const tag = match[1].toLowerCase();
      if (quizBlockHtmlTags.has(tag)) found.push({ tag, line: index + 1 });
    }
  }
  return found;
}

function inspectMarkdown(
  markdown: string,
  sourceFile: string,
  options: LintOptions = {},
): {
  diagnostics: LintDiagnostic[];
  includes: Include[];
  downloadables: DownloadableLink[];
} {
  const lines = markdown.split(/\r?\n/);
  const tree = unified().use(remarkParse).use(remarkGfm).use(
    remarkFrontmatter,
    ["yaml"],
  ).use(
    remarkDirective,
  ).parse(markdown) as Node;
  const diagnostics: LintDiagnostic[] = [];
  const includes: Include[] = [];
  const ignoredLines = new Set<number>();
  const report = (
    node: Node | undefined,
    rule: string,
    message: string,
    severity: "error" | "warning" = "error",
  ) => {
    diagnostics.push({
      sourceFile,
      line: node?.position?.start.line ?? 1,
      column: node?.position?.start.column ?? 1,
      severity,
      rule,
      message,
    });
  };
  const fenceLength = (node: Node) => {
    const start = node.position!.start;
    return lines[start.line - 1].slice(start.column - 1).match(/^:+/)?.[0]
      .length ?? 0;
  };

  // Consecutive lines form one paragraph in Markdown, so "_Label_: a" and
  // "_Label_: b" on separate plain lines render as one run-on line.
  const metadataField =
    /(?:_[^_\s][^_\n]*_|\*\*[^*\n]+?\*\*):|\*\*[^*\n]+?:\*\*/g;
  function checkMetadataFields(paragraph: Node): void {
    const { start, end } = paragraph.position!;
    const raw = lines.slice(start.line - 1, end.line).join("\n");
    if ((raw.match(metadataField) ?? []).length < 2) return;
    report(
      paragraph,
      "metadata-fields-one-line",
      "Several 'Label: value' fields end up on one line. Make each field a list item (- _Label_: value).",
      "warning",
    );
  }

  // BSO reads only `sidebar_position` from a lesson's frontmatter (menu order,
  // like the Docusaurus sidebar); any other key is ignored by BSO.
  const frontmatter = tree.children?.[0];
  if (options.moduleIndex) {
    const title = tree.children?.find((node) =>
      node.type === "heading" && node.depth === 1
    );
    if (!title || !nodeText(title).trim()) {
      report(
        title,
        "module-index-title",
        "Add a non-empty '# title' heading to this module's index.md; frontmatter title is not used for the menu.",
      );
    }
  }
  // A slide deck marks itself with `slides: true` or `marp: true`; its front
  // matter holds Marp directives, so it is not a lesson page.
  const isSlideDeck = frontmatter?.type === "yaml" &&
    /^(?:slides|marp)[ \t]*:[ \t]*true\b/m.test(
      String((frontmatter as { value?: string }).value ?? ""),
    );
  if (options.lessonFile && frontmatter?.type === "yaml" && !isSlideDeck) {
    const yaml = String((frontmatter as { value?: string }).value ?? "");
    const keys = [...yaml.matchAll(/^([A-Za-z_][\w-]*)\s*:/gm)].map((m) =>
      m[1]
    );
    const ignored = [
      ...new Set(
        keys.filter((key) => key !== "sidebar_position" && key !== "draft"),
      ),
    ];
    if (ignored.length > 0) {
      report(
        frontmatter,
        "lesson-frontmatter",
        `YAML frontmatter key${ignored.length > 1 ? "s" : ""} ${
          ignored.map((key) => `'${key}'`).join(", ")
        } ${
          ignored.length > 1 ? "are" : "is"
        } ignored in lesson pages; only 'sidebar_position' (menu order) and 'draft' (left out of the menu) are used. Put the title as '# heading' and remove the rest.`,
        "warning",
      );
    }
    if (
      keys.includes("sidebar_position") &&
      readSidebarPosition(`---\n${yaml}\n---`) === undefined
    ) {
      report(
        frontmatter,
        "lesson-frontmatter",
        "'sidebar_position' must be a number, for example 'sidebar_position: 2'; BSO ignores any other value.",
        "warning",
      );
    }
  }

  // Text wrapped at a fixed column (editor or tool wrap) gives noisy diffs and
  // breaks AI-assisted editing; the output does not change, since Markdown
  // renders a single line break as a space. Intentional breaks (two trailing
  // spaces or a backslash) do not count.
  function checkHardWrap(paragraph: Node): void {
    const { start, end } = paragraph.position!;
    if (end.line - start.line < 2) return;
    const wrapped = lines.slice(start.line - 1, end.line - 1).map((line) =>
      /( {2,}|\\)$/.test(line) ? 0 : line.trim().length
    );
    if (wrapped.some((length) => length < 50)) return;
    if (Math.max(...wrapped) - Math.min(...wrapped) > 25) return;
    report(
      paragraph,
      "hard-wrapped-lines",
      "This paragraph looks wrapped at a fixed column. Write each paragraph on one line and let the editor wrap it.",
      "warning",
    );
  }

  // Four or more `../` in a row: the path breaks when the file moves (three are accepted: a shared folder next to the weeks is a normal layout). Links,
  // images and `{@include}` targets (which parse as links) are all checked.
  function checkDeepRelativePath(node: Node): void {
    const path = (node.url ?? "").split(/[?#]/, 1)[0];
    if (!/(?:^|[\\/])\.\.[\\/]\.\.[\\/]\.\.[\\/]\.\.(?:[\\/]|$)/.test(path)) {
      return;
    }
    report(
      node,
      "deep-relative-path",
      `Avoid going up four or more folders with '../' in '${path}'; move the file closer or into a shared folder inside sourcesDir, to avoid brittle file paths.`,
      "warning",
    );
  }

  // A `---` that gives Marp an empty slide. Only slide decks are checked: a
  // file that marks itself with `slides: true` or `marp: true`.
  function checkSlideSeparators(): void {
    const match = markdown.match(
      /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
    );
    if (!match || !/^(?:slides|marp)[ \t]*:[ \t]*true\b/m.test(match[1])) {
      return;
    }
    const levels = headingDividerLevels(match[1]);
    const offset = match[0].split(/\r?\n/).length - 1;
    const body = markdown.slice(match[0].length).replace(/\r\n/g, "\n");
    for (const index of findEmptySlideSeparators(body, levels)) {
      diagnostics.push({
        sourceFile,
        line: offset + index + 1,
        column: 1,
        severity: "warning",
        rule: "slides-empty-separator",
        message: levels.length
          ? "This '---' gives an empty slide: it is followed by nothing, by another '---', or by a heading that 'headingDivider' already starts a slide at. Remove it, or put content between it and the next heading."
          : "This '---' gives an empty slide: it is followed by nothing or by another '---', or it opens the slide deck. Remove it.",
      });
    }
  }

  // A lesson that becomes slides gets one slide per `##` section and a contents
  // slide: numbered headings and at most nine sections keep that readable.
  function checkGeneratedSlides(): void {
    if (!options.generatedSlides) return;
    const all = ((tree as Node).children ?? []).filter((node) =>
      node.type === "heading" && node.depth === 2
    );
    // Sources are never numbered, and not counted as a section.
    const sections = all.filter((heading) =>
      !isSourcesHeading(nodeText(heading))
    );
    const unnumbered = sections.filter((heading) =>
      !hasSectionNumber(nodeText(heading))
    );
    if (unnumbered.length > 0) {
      report(
        unnumbered[0],
        "slides-unnumbered-headings",
        `${unnumbered.length} of ${sections.length} section headings ('##') have no number, such as '## 1. Introduction'. This lesson becomes slides, and the contents slide and the slides themselves are easier to follow with numbered sections.`,
        "warning",
      );
    }
    for (const section of sectionsWithoutSlideContent(markdown)) {
      // A link to a `.md` file may point to a slide deck whose slides are
      // inserted, so this section is not reported.
      if (section.linksToMarkdown) continue;
      diagnostics.push({
        sourceFile,
        line: section.line,
        column: 1,
        severity: "warning",
        rule: "slides-section-without-content",
        message:
          `The section '${section.heading}' has no list, table, image, code or diagram, so it gets no slide and is not in the contents slide. Add one, or leave it as running text on purpose.`,
      });
    }
    if (sections.length > 9) {
      report(
        sections[9],
        "slides-too-many-sections",
        `This lesson becomes slides and has ${sections.length} sections ('##'); more than 9 makes a long contents slide and a long slide deck. Split the lesson or merge sections.`,
        "warning",
      );
    }
  }

  // APA: the reference list is an unnumbered section after the text, so a
  // 'Sources' or 'Bronnen' heading must not carry a number.
  function checkNumberedSources(): void {
    const headingNodes: Node[] = [];
    collectHeadingNodes(tree, headingNodes);
    for (const heading of headingNodes) {
      const text = nodeText(heading);
      if (!isSourcesHeading(text) || !hasSectionNumber(text)) continue;
      report(
        heading,
        "numbered-sources",
        `'${text.trim()}' is a list of sources and must not have a section number; write it as '## ${
          text.trim().replace(/^\d+(?:\.\d+)*[.)]?\s+/, "")
        }'.`,
        "warning",
      );
    }
  }

  function walk(node: Node, containers: Node[] = []): void {
    if (node.type === "link" || node.type === "image") {
      checkDeepRelativePath(node);
    }
    if (node.type === "paragraph") {
      checkMetadataFields(node);
      checkHardWrap(node);
    }
    if (["code", "html", "yaml"].includes(node.type)) {
      for (
        let i = node.position!.start.line;
        i <= node.position!.end.line;
        i++
      ) ignoredLines.add(i);
      return;
    }
    const isFlashcard =
      ["containerDirective", "leafDirective", "textDirective"].includes(
        node.type,
      ) &&
      (node.name === "flashcards" || node.name === "flashcard");
    if (isFlashcard) {
      if (node.type !== "containerDirective") {
        report(
          node,
          "flashcard-container",
          "Use block containers: ::::flashcards around :::flashcard cards.",
        );
      } else {
        const parent = containers.at(-1);
        const badNesting = parent && fenceLength(parent) <= fenceLength(node);
        if (badNesting) {
          report(
            node,
            "flashcard-fence-nesting",
            "The outer container needs more colons than its cards: use ::::flashcards and :::flashcard, closing with :::: and ::: respectively.",
          );
        }
        const end = node.position!.end;
        const closing = lines[end.line - 1].slice(0, end.column - 1).match(
          /(:{3,})\s*$/,
        );
        // Invalid nesting already explains a prematurely closed inner card.
        if (
          !badNesting && (!closing || closing[1].length < fenceLength(node))
        ) {
          report(
            node,
            "flashcard-unclosed",
            `Close ${node.name} with ${
              ":".repeat(fenceLength(node))
            } on its own line.`,
          );
        }
        if (node.name === "flashcard") {
          if (!containers.some((ancestor) => ancestor.name === "flashcards")) {
            report(
              node,
              "flashcard-outside-set",
              "Place this card inside a ::::flashcards container so the shared controls can initialize it.",
            );
          }
          const first = node.children?.[0];
          const term = first?.type === "paragraph" ? nodeText(first) : "";
          if (!/^term:\s*\S/.test(term)) {
            report(
              node,
              "flashcard-term",
              "Start the card with a non-empty 'term: ...' paragraph, followed by a blank line and its definition.",
            );
          }
          if (
            !node.children?.slice(1).some((child) => nodeText(child).trim())
          ) {
            report(
              node,
              "flashcard-definition",
              "This card has no definition paragraph. Separate the term and definition with a blank line.",
              "warning",
            );
          }
        } else if (
          !node.children?.some((child) =>
            (child.type === "containerDirective" &&
              child.name === "flashcard") || isFlashcardList(child)
          )
        ) {
          report(
            node,
            "flashcard-empty-set",
            "This flashcard set has no direct flashcard children or complete term/definition list.",
            "warning",
          );
        }
      }
    }
    const ancestors = node.type === "containerDirective"
      ? [...containers, node]
      : containers;
    for (const child of node.children ?? []) walk(child, ancestors);
  }
  walk(tree);
  checkSlideSeparators();
  checkGeneratedSlides();
  checkNumberedSources();

  const filename = basename(sourceFile);
  if (
    (filename.startsWith("reader-") || filename === "plantuml-essentials.md") &&
    readerHeadingNumberLintEnabled(markdown)
  ) {
    const headingNodes: Node[] = [];
    collectHeadingNodes(tree, headingNodes);
    const readerHeadings = headingNodes.map((heading) => ({
      depth: heading.depth!,
      text: nodeText(heading),
    }));
    for (const issue of checkReaderHeadingNumbers(readerHeadings)) {
      // A numbered Sources heading has its own rule (numbered-sources).
      if (
        isSourcesHeading(issue.heading.text) &&
        hasSectionNumber(issue.heading.text)
      ) continue;
      report(
        headingNodes[readerHeadings.indexOf(issue.heading)],
        "reader-heading-numbering",
        issue.message,
      );
    }
  }

  const headings = new Set(
    resolveFlashcardsOptions(options.flashcards).sectionHeadings.map(
      normalizeSectionHeading,
    ),
  );
  function checkSections(parent: Node): void {
    const children = parent.children ?? [];
    for (let index = 0; index < children.length; index++) {
      const heading = children[index];
      if (
        heading.type !== "heading" ||
        !headings.has(normalizeSectionHeading(nodeText(heading)))
      ) continue;
      let end = index + 1;
      while (
        end < children.length &&
        !(children[end].type === "heading" &&
          children[end].depth! <= heading.depth!)
      ) end++;
      const content = children.slice(index + 1, end);
      // Both syntaxes are valid: term/definition bullet lists and ::::flashcards sets.
      const isDirectiveSet = (child: Node) =>
        child.type === "containerDirective" && child.name === "flashcards";
      const invalid = content.find((child) =>
        !isFlashcardList(child) && !isDirectiveSet(child)
      );
      if (invalid || content.length === 0) {
        report(
          invalid ?? heading,
          "flashcard-section-content",
          `Section '${
            nodeText(heading)
          }' must contain flashcards: either unordered lists of non-empty 'term: definition' items or a ::::flashcards set. Move prose, subheadings and other content outside this section.`,
          "warning",
        );
      }
    }
    for (const child of children) checkSections(child);
  }
  checkSections(tree);

  lines.forEach((line, index) => {
    if (
      ignoredLines.has(index + 1) || !line.trimStart().startsWith("{@include")
    ) return;
    const match = line.trim().match(/^\{@include:\s*(.+?)\s*\}$/);
    try {
      if (!match) {
        throw new Error(
          "Use {@include: [link text](relative/path.md)} on its own line.",
        );
      }
      includes.push({
        target: parseIncludeTarget(match[1], line),
        line: index + 1,
        column: line.indexOf("{") + 1,
      });
    } catch (error) {
      diagnostics.push({
        sourceFile,
        line: index + 1,
        column: line.indexOf("{") + 1,
        severity: "error",
        rule: "include-syntax",
        message: (error as Error).message,
      });
    }
  });

  for (const issue of detectDiagramIssues(markdown, sourceFile)) {
    diagnostics.push({
      sourceFile,
      line: issue.position?.line ?? 1,
      column: issue.position?.column ?? 1,
      severity: "error",
      rule: `diagram-${issue.kind}`,
      message: issue.message,
    });
  }

  if (basename(sourceFile).startsWith("quiz-")) {
    for (const { tag, line } of unsupportedQuizHtmlBlocks(markdown)) {
      diagnostics.push({
        sourceFile,
        line,
        column: 1,
        severity: "warning",
        rule: "quiz-unsupported-html",
        message:
          `The <${tag}> block is not supported in QTI quiz text; use Markdown instead.`,
      });
    }
    const quiz = parseQuizMarkdown(markdown, options);
    const quizIssues = isQuizDown(markdown)
      ? lintQuizDown(markdown)
      : validateQuiz(quiz, options);
    for (const issue of quizIssues) {
      diagnostics.push({
        sourceFile,
        line: issue.line,
        column: 1,
        severity: issue.severity ?? "error",
        rule: issue.rule,
        message: `${
          issue.question !== undefined ? `Question ${issue.question}: ` : ""
        }${issue.message}`,
      });
    }
    // Diagrams inside a ````quiz block are not visible to the file-level check above.
    if (isQuizDown(markdown)) {
      for (
        const field of quizDiagramFields(quiz, resolveQuizOptions(options))
      ) {
        for (const issue of detectDiagramIssues(field.markdown, sourceFile)) {
          diagnostics.push({
            sourceFile,
            line: field.line ?? 1,
            column: 1,
            severity: "error",
            rule: `diagram-${issue.kind}`,
            message: issue.message,
          });
        }
      }
    }
    const teacherAnswers = options.teacherAnswers === undefined
      ? undefined
      : parseTeacherAnswers(options.teacherAnswers, options);
    for (
      const finding of checkQuizBias(quiz, teacherAnswers, options.quizBias)
    ) {
      diagnostics.push({
        sourceFile,
        line: finding.line,
        column: 1,
        severity: finding.severity,
        rule: finding.rule,
        message: `${
          finding.question !== undefined ? `Question ${finding.question}: ` : ""
        }${finding.message}`,
      });
    }
  }

  diagnostics.sort(compareDiagnostics);
  return {
    diagnostics,
    includes,
    downloadables: findDownloadableLinks(markdown),
  };
}

function readTextOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path);
  } catch {
    return null;
  }
}

/** The slide decks that a file links to, read relative to that file. */
function deckLinksOf(file: string, text: string) {
  return findDeckLinks(
    text,
    (href) => resolve(dirname(file), decodeURIComponent(href)),
    readTextOrNull,
    (path) => basename(path, ".md"),
  );
}

/**
 * Slides insert a linked slide deck one level deep and only once. A lesson
 * therefore gets a warning when it links a slide deck that itself links another
 * slide deck, and when it links the same slide deck twice.
 */
function checkDeckLinks(file: string, text: string): LintDiagnostic[] {
  const found: LintDiagnostic[] = [];
  const decks = deckLinksOf(file, text);
  const seen = new Set<string>();
  const warn = (line: number, rule: string, message: string) =>
    found.push({
      sourceFile: file,
      line,
      column: 1,
      severity: "warning",
      rule,
      message,
    });
  for (const deck of decks) {
    if (seen.has(deck.path)) {
      warn(
        deck.line,
        "slides-deck-linked-twice",
        `The slide deck '${deck.href}' is linked more than once; its slides are inserted at the first link only. Remove this link or the other one.`,
      );
      continue;
    }
    seen.add(deck.path);
    if (
      !isSlideDeck(text) &&
      deckLinksOf(deck.path, readTextOrNull(deck.path) ?? "").length > 0
    ) {
      warn(
        deck.line,
        "slides-nested-deck",
        `The slide deck '${deck.href}' links to another slide deck. Slides take a linked slide deck one level deep, so that slide deck is not inserted; link both slide decks from the lesson instead.`,
      );
    }
  }
  return found;
}

/**
 * A package in the publication folder is out of date when its version differs
 * from the `version` of the course, because it was published for another
 * version. Only packages of this course (`<name>.v<version>.imscc` or
 * `.d2l.zip`) count.
 */
async function checkPublishedVersions(
  config: ResolvedConfig,
): Promise<LintDiagnostic[]> {
  if (!config.publishDir) return [];
  const folder = join(config.publishDir, "brightspace");
  const found: LintDiagnostic[] = [];
  const escaped = config.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\.v(.+?)(?:\\.imscc|\\.d2l\\.zip)$`);
  try {
    for await (const entry of Deno.readDir(folder)) {
      const version = entry.isFile ? entry.name.match(pattern)?.[1] : undefined;
      if (version === undefined || version === config.version) continue;
      found.push({
        sourceFile: join(folder, entry.name),
        line: 1,
        column: 1,
        severity: "warning",
        rule: "publish-version-mismatch",
        message:
          `The publication folder has '${entry.name}', but the course version is ${config.version}. Run 'bso pack' to publish the current version; it removes the older one.`,
      });
    }
  } catch {
    // No publication folder yet: nothing is stale.
  }
  return found.sort((a, b) => a.sourceFile < b.sourceFile ? -1 : 1);
}

/**
 * The glob patterns of the `nest` setting for each lesson that has the setting,
 * keyed by the absolute path of the lesson.
 */
function nestGlobsByLesson(
  slides: SlidesConfig | undefined,
  sourcesDir: string,
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [lesson, selection] of Object.entries(slides?.lessons ?? {})) {
    if (typeof selection !== "object" || selection === null) continue;
    const nest = (selection as { nest?: string | string[] }).nest;
    if (nest !== undefined) {
      found.set(resolve(sourcesDir, lesson), [nest].flat());
    }
  }
  return found;
}

/**
 * Checks the `nest` setting of a lesson. A pattern that matches no link is
 * probably a typo, and nesting more than nine pages under one section gives a
 * reader more than they can take in at once.
 */
function checkNestedPages(
  file: string,
  text: string,
  globs: string[],
): LintDiagnostic[] {
  const matchers = globs.map((glob) =>
    globToRegExp(glob.replaceAll("\\", "/"), { extended: true, globstar: true })
  );
  const links = findMarkdownLinks(text).filter((link) =>
    matchers.some((matcher) => matcher.test(link.href.replace(/^\.\//, "")))
  );
  const found: LintDiagnostic[] = [];
  const warn = (line: number, rule: string, message: string) =>
    found.push({
      sourceFile: file,
      line,
      column: 1,
      severity: "warning",
      rule,
      message,
    });
  if (!links.length) {
    warn(
      1,
      "slides-nest-unused",
      `The nest pattern ${
        globs.map((glob) => `'${glob}'`).join(", ")
      } matches no link in this lesson, so nothing is nested. Check the pattern; it is relative to the folder of the lesson.`,
    );
    return found;
  }
  const headings = text.split("\n").flatMap((line, index) =>
    /^##\s/.test(line) ? [index + 1] : []
  );
  const perSection = new Map<number, Set<string>>();
  for (const link of links) {
    const section = headings.filter((line) => line < link.line).length;
    const seen = perSection.get(section) ?? new Set<string>();
    if (!seen.has(link.href) && seen.size === 9) {
      warn(
        link.line,
        "slides-too-many-nested",
        "More than 9 pages are nested under this section; more than seven plus or minus two items in one place are hard to take in. Split the section.",
      );
    }
    seen.add(link.href);
    perSection.set(section, seen);
  }
  return found;
}

/**
 * The lesson files that are turned into slides: those with `generate: true` in
 * `slides.lessons`, and the files whose name starts with `slides.generateForPrefix`
 * (unless a mapping says `generate: false` or gives only a slide deck).
 */
export function generatedSlideLessons(
  slides: SlidesConfig | undefined,
  sourcesDir: string,
  lessonFiles: string[],
): Set<string> {
  const generated = new Set<string>();
  if (!slides) return generated;
  const mapped = new Map<string, boolean>();
  for (const [lesson, selection] of Object.entries(slides.lessons ?? {})) {
    const file = resolve(sourcesDir, lesson);
    const generate = typeof selection === "object" && selection !== null &&
      (selection as { generate?: boolean }).generate === true;
    mapped.set(file, generate);
    if (generate) generated.add(file);
  }
  const prefix = slides.generateForPrefix;
  if (prefix) {
    for (const file of lessonFiles) {
      if (basename(file).startsWith(prefix) && !mapped.has(file)) {
        generated.add(file);
      }
    }
  }
  return generated;
}

/**
 * File types that belong in the course folders without a word: Markdown, images,
 * documents and downloads. Anything else, an `.xml` file or an old QTI export for
 * example, gets the warning `unexpected-file` unless `lint.allowedFileTypes` lists it.
 */
export const DEFAULT_ALLOWED_FILE_TYPES = [
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".pdf",
  ".zip",
  ".pptx",
  ".docx",
  ".xlsx",
  ".csv",
  ".txt",
  ".json",
];

/** The files under a folder whose type is not allowed; dot files and `node_modules` are skipped. */
export async function unexpectedFiles(
  dir: string,
  extraTypes: string[] = [],
): Promise<string[]> {
  const allowed = new Set(
    [...DEFAULT_ALLOWED_FILE_TYPES, ...extraTypes].map((type) =>
      type.toLowerCase()
    ),
  );
  const found: string[] = [];
  async function walk(current: string): Promise<void> {
    for await (const entry of Deno.readDir(current)) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = join(current, entry.name);
      if (entry.isSymlink) continue;
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile) {
        const extension = /\.[^./\\]+$/.exec(entry.name)?.[0].toLowerCase() ??
          "";
        if (!allowed.has(extension)) found.push(path);
      }
    }
  }
  await walk(dir);
  return found.sort();
}

/**
 * What is wrong with the whitespace in one folder or file name, or undefined.
 * Edge, double and unusual whitespace break paths in tools and show as `%20`
 * or worse in URLs; a single space only shows as `%20` in the preview.
 */
export function nameWhitespaceProblem(name: string): string | undefined {
  if (/[^\S ]/.test(name)) {
    return "contains a whitespace character that is not an ordinary space (a tab or a no-break space, for example)";
  }
  if (name !== name.trim() || /\s\.[^.]+$/.test(name) || /^\.?\s/.test(name)) {
    return "starts or ends with a space (or has one before the extension)";
  }
  if (/ {2,}/.test(name)) return "contains two or more spaces in a row";
  if (name.includes(" ")) {
    return "contains a space, which shows as %20 in a URL and in the preview; use a hyphen";
  }
  return undefined;
}

/**
 * The slide decks that `slides.lessons` selects with a `decks` pattern, which
 * may sit outside `sourcesDir`. Lint checks them like any other Markdown file.
 */
export async function selectedDeckFiles(
  slides: SlidesConfig | undefined,
  repoRoot: string,
  skip: string[],
): Promise<string[]> {
  const patterns = Object.values(slides?.lessons ?? {}).flatMap((selection) =>
    typeof selection === "string"
      ? [selection]
      : typeof selection === "object" && selection !== null &&
          typeof (selection as { decks?: unknown }).decks === "string"
      ? [(selection as { decks: string }).decks]
      : []
  );
  if (!patterns.length) return [];
  const matchers = patterns.map((pattern) =>
    globToRegExp(pattern.replaceAll("\\", "/"), {
      extended: true,
      globstar: true,
    })
  );
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (
        entry.isSymlink || skip.includes(path) || entry.name === ".git" ||
        entry.name === "node_modules"
      ) continue;
      if (entry.isDirectory) await walk(path);
      else if (
        entry.isFile && /\.md$/i.test(entry.name) &&
        matchers.some((matcher) =>
          matcher.test(relative(repoRoot, path).replaceAll("\\", "/"))
        )
      ) found.push(path);
    }
  }
  await walk(repoRoot);
  return found.sort();
}

/** Check BSO-specific Markdown syntax without file writes or network requests. */
export function lintMarkdown(
  markdown: string,
  sourceFile: string,
  options: LintOptions = {},
): LintDiagnostic[] {
  return inspectMarkdown(markdown, sourceFile, options).diagnostics;
}

/** Check configured lessons/readers/quizzes and their linked include files offline. */
export async function lintCourse(config: ResolvedConfig): Promise<LintResult> {
  const files = new Set<string>();
  const lessonFiles = new Set<string>();
  const moduleIndexFiles = new Set<string>();
  const directories: LintResult["directories"] = [];
  const lintDirs = new Set(
    (config.lint?.includeDirs ?? [config.sourcesDir, config.readersDir])
      .filter((dir): dir is string => Boolean(dir)),
  );
  for (
    const dir of lintDirs
  ) {
    const scan = await scanSources({
      sourcesDir: dir,
      repoRoot: config.repoRoot,
    });
    for (const file of scan.markdownFiles) lessonFiles.add(file);
    directories.push({
      dir: relative(config.repoRoot, dir) || ".",
      files: scan.markdownFiles.length + scan.quizFiles.length +
        scan.readerFiles.length,
    });
    for (
      const file of [
        ...scan.markdownFiles,
        ...scan.quizFiles,
        ...scan.readerFiles,
      ]
    ) files.add(file);
  }
  // The decks of a lesson that is linted are linted too, also when they sit
  // outside the lint directories. A lint of one chosen folder has none of those lessons.
  const lintedLessons = Object.fromEntries(
    Object.entries(config.slides?.lessons ?? {}).filter(([lesson]) =>
      lessonFiles.has(resolve(config.sourcesDir, lesson))
    ),
  );
  const deckFiles = (await selectedDeckFiles(
    config.slides ? { ...config.slides, lessons: lintedLessons } : undefined,
    config.repoRoot,
    [config.outputDir, ...lintDirs].map((dir) => resolve(dir)),
  )).filter((file) => !files.has(file));
  if (deckFiles.length) {
    directories.push({
      dir: "slide decks of slides.lessons",
      files: deckFiles.length,
    });
    for (const file of deckFiles) files.add(file);
  }
  for (const file of lessonFiles) {
    const parts = relative(config.sourcesDir, file).split(/[\\/]/);
    if (parts.length === 2 && parts[1] === "index.md") {
      moduleIndexFiles.add(file);
    }
  }
  const slideLessons = generatedSlideLessons(
    config.slides,
    config.sourcesDir,
    [...lessonFiles],
  );
  const nestGlobsOf = nestGlobsByLesson(config.slides, config.sourcesDir);
  const visited = new Set<string>();
  const diagnostics: LintDiagnostic[] = [];
  async function check(file: string, ancestors: string[] = []): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    const sourceRelative = relative(config.sourcesDir, file);
    const downloadRoot = sourceRelative === ".." ||
        sourceRelative.startsWith("../") ||
        sourceRelative.startsWith("..\\") || isAbsolute(sourceRelative)
      ? undefined
      : config.sourcesDir;
    const fileText = await Deno.readTextFile(file);
    if (deckFiles.includes(file) && deckMarkerConflict(fileText)) {
      diagnostics.push({
        sourceFile: file,
        line: 1,
        column: 1,
        severity: "error",
        rule: "slides-deck-invalid",
        message:
          "A `decks` pattern in slides.lessons selects this file, but its front matter has both 'slides' and 'marp'; use only 'slides: true'.",
      });
    }
    const result = inspectMarkdown(fileText, file, {
      flashcards: config.flashcards,
      lessonFile: lessonFiles.has(file),
      generatedSlides: slideLessons.has(file),
      moduleIndex: moduleIndexFiles.has(file),
      quizBias: config.lint?.quizBias,
      locale: config.quiz.locale,
      assignmentPrefix: config.quiz.assignmentPrefix,
      questionPrefix: config.quiz.questionPrefix,
      subquestionPrefix: config.quiz.subquestionPrefix,
      teacherAnswers: await readTeacherAnswers(file),
    });
    diagnostics.push(...result.diagnostics);
    diagnostics.push(...checkDeckLinks(file, fileText));
    const nestGlobs = nestGlobsOf.get(file);
    if (nestGlobs) {
      diagnostics.push(...checkNestedPages(file, fileText, nestGlobs));
    }
    for (const link of result.downloadables) {
      if (!downloadRoot) continue;
      const resolved = await resolveDownloadableFile(
        link.url,
        file,
        downloadRoot,
      );
      if (!("error" in resolved)) continue;
      const [rule, message] = resolved.error === "missing"
        ? [
          "downloadable-missing",
          `Download file not found or not a file: ${link.url}`,
        ]
        : resolved.error === "too-large"
        ? [
          "downloadable-too-large",
          `Download files must be no larger than ${
            MAX_DOWNLOADABLE_FILE_SIZE / (1024 * 1024)
          } MiB: ${link.url}`,
        ]
        : resolved.error === "outside-sources"
        ? [
          "downloadable-path",
          `Download files must be inside sourcesDir: ${link.url}`,
        ]
        : [
          "downloadable-path",
          `Invalid URL encoding in download link: ${link.url}`,
        ];
      diagnostics.push({
        sourceFile: file,
        line: link.line,
        column: link.column,
        severity: "error",
        rule,
        message,
      });
    }
    for (const include of result.includes) {
      const target = resolve(dirname(file), include.target);
      const rel = relative(config.repoRoot, target);
      const problem = (rule: string, message: string) =>
        diagnostics.push({
          sourceFile: file,
          line: include.line,
          column: include.column,
          severity: "error",
          rule,
          message,
        });
      if (
        /^[a-z][a-z\d+.-]*:/i.test(include.target) || rel === ".." ||
        rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)
      ) {
        problem(
          "include-path",
          "Include targets must be local files inside the repository.",
        );
        continue;
      }
      if (target === file || ancestors.includes(target)) {
        problem("include-cycle", `Cyclic include: ${include.target}`);
        continue;
      }
      try {
        if (!(await Deno.stat(target)).isFile) throw new Error("not a file");
      } catch {
        problem(
          "include-missing",
          `Include file not found or not readable: ${include.target}`,
        );
        continue;
      }
      // Slides expand an include one level deep; an include inside it stays a directive.
      if (
        isSlideDeck(fileText) &&
        /^\s*\{@include:/m.test(await Deno.readTextFile(target))
      ) {
        diagnostics.push({
          sourceFile: file,
          line: include.line,
          column: include.column,
          severity: "warning",
          rule: "slides-nested-include",
          message:
            `Slides expand an include one level deep: the {@include} inside ${include.target} is not expanded on the slides. Put that include in this slide deck, or merge the files.`,
        });
      }
      await check(target, [...ancestors, file]);
    }
  }
  for (const file of [...files].sort()) await check(file);
  // The order and the contents of the menu: the overview of a module, `sidebar_position` and `draft`.
  const quizFilesOfCourse = new Set<string>();
  const menuFiles = new Set<string>(lessonFiles);
  for (const dir of lintDirs) {
    const scan = await scanSources({
      sourcesDir: dir,
      repoRoot: config.repoRoot,
    });
    for (const file of scan.quizFiles) quizFilesOfCourse.add(file);
  }
  for (const file of quizFilesOfCourse) menuFiles.add(file);
  const menu = await planMenu({
    sourcesDir: config.sourcesDir,
    files: [...menuFiles].filter((file) => {
      const path = relative(config.sourcesDir, file);
      return path !== ".." && !path.startsWith("..") && !isAbsolute(path);
    }),
    overviewHeadings: config.menu.overviewHeadings,
    alwaysIncluded: config.teacherPage ? [config.teacherPage.path] : [],
  });
  for (const issue of menu.issues) {
    diagnostics.push({
      sourceFile: issue.file,
      line: issue.line,
      column: 1,
      severity: issue.severity,
      rule: issue.rule,
      message: issue.message,
    });
  }
  // A link to a file that is left out of the menu is a dead link in the package.
  for (const file of [...menuFiles].sort()) {
    if (menu.excluded.has(file)) continue;
    for (const link of findMarkdownLinks(await Deno.readTextFile(file))) {
      let path = link.href.split(/[?#]/, 1)[0];
      try {
        path = decodeURIComponent(path);
      } catch {
        // keep the raw path
      }
      if (!/\.md$/i.test(path)) continue;
      const target = resolve(dirname(file), path);
      if (!menu.excluded.has(target)) continue;
      // The overview of a lead page is reported by its own rules.
      if (isLeadPageName(basename(file)) && menu.listed.has(target)) continue;
      diagnostics.push({
        sourceFile: file,
        line: link.line,
        column: 1,
        severity: "warning",
        rule: "menu-link-excluded",
        message:
          `The link to '${link.href}' points at a file that is left out of the menu and the package (a draft, or not in the overview of its module), so it is a dead link for students.`,
      });
    }
  }
  // Files that do not belong in the course folders: old QTI exports, for example.
  for (const dir of lintDirs) {
    for (
      const file of await unexpectedFiles(dir, config.lint?.allowedFileTypes)
    ) {
      const extension = /\.[^./\\]+$/.exec(file)?.[0] ?? "(no extension)";
      diagnostics.push({
        sourceFile: file,
        line: 1,
        column: 1,
        severity: "warning",
        rule: "unexpected-file",
        message:
          `A ${extension} file does not belong in the course folders; it may be an old export (a QTI quiz, for example) that BSO does not use. Remove it, or allow the type with lint.allowedFileTypes: ["${extension}"].`,
      });
    }
  }
  // Folder and file names under the repository: each offending name once.
  const reportedNames = new Set<string>();
  for (const file of [...files].sort()) {
    const parts = relative(config.repoRoot, file).split(/[\\/]/);
    if (parts[0] === "..") continue;
    for (let index = 0; index < parts.length; index++) {
      const path = parts.slice(0, index + 1).join("/");
      if (reportedNames.has(path)) continue;
      const problem = nameWhitespaceProblem(parts[index]);
      if (!problem) continue;
      reportedNames.add(path);
      diagnostics.push({
        sourceFile: resolve(config.repoRoot, path),
        line: 1,
        column: 1,
        severity: "warning",
        rule: "path-whitespace",
        message: `The ${index === parts.length - 1 ? "file" : "folder"} name '${
          parts[index]
        }' ${problem}.`,
      });
    }
  }
  const visitedCategoryDirectories = new Set<string>();
  async function findCategoryMetadata(dir: string): Promise<void> {
    if (visitedCategoryDirectories.has(dir)) return;
    visitedCategoryDirectories.add(dir);
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory) {
        await findCategoryMetadata(path);
      } else if (entry.isFile && entry.name === "_category_.json") {
        diagnostics.push({
          sourceFile: path,
          line: 1,
          column: 1,
          severity: "warning",
          rule: "docusaurus-category-metadata",
          message:
            "BSO does not use _category_.json; module names and titles come from the folder and index.md.",
        });
      }
    }
  }
  for (const dir of lintDirs) {
    const rel = relative(config.sourcesDir, dir);
    const outsideSources = rel === ".." || rel.startsWith("../") ||
      rel.startsWith("..\\") || isAbsolute(rel);
    if (!outsideSources) {
      await findCategoryMetadata(dir);
    }
  }
  diagnostics.push(...await checkPublishedVersions(config));
  diagnostics.sort(compareDiagnostics);
  return {
    filesChecked: visited.size,
    diagnostics,
    directories,
    includedFiles: visited.size - files.size,
  };
}

/** Lines that say what a lint run scanned, so the file count is not a mystery. */
export function formatLintScope(result: LintResult): string[] {
  const count = (n: number) => `${n} Markdown file${n === 1 ? "" : "s"}`;
  return [
    "Scanning:",
    ...result.directories.map(({ dir, files }) =>
      `  ${dir}/ (${count(files)})`
    ),
    ...(result.includedFiles
      ? [
        `  + ${result.includedFiles} linked include file${
          result.includedFiles === 1 ? "" : "s"
        }`,
      ]
      : []),
  ];
}

/** Color only on a terminal, never with `NO_COLOR` set (https://no-color.org) or `TERM=dumb`. */
export function shouldColorLint(
  isTerminal: boolean,
  env: { get(name: string): string | undefined },
): boolean {
  return isTerminal && !env.get("NO_COLOR") && env.get("TERM") !== "dumb";
}

const SEVERITY_COLORS: Record<string, string> = {
  error: "\x1b[31m", // red
  warning: "\x1b[38;5;166m", // dark orange
};

/**
 * Format an editor-friendly, one-line diagnostic. With `color`, only the
 * severity word is colored, so the `path:line:col` prefix stays clickable and
 * the message stays readable.
 */
export function formatLintDiagnostic(
  diagnostic: LintDiagnostic,
  repoRoot: string,
  color = false,
): string {
  const code = color ? SEVERITY_COLORS[diagnostic.severity] : undefined;
  const severity = code
    ? `${code}${diagnostic.severity}\x1b[0m`
    : diagnostic.severity;
  return `${
    relative(repoRoot, diagnostic.sourceFile)
  }:${diagnostic.line}:${diagnostic.column}: ${severity} ${diagnostic.rule}: ${diagnostic.message}`;
}

/** The `*-antwoorden-docent.md` next to `quiz-*-vragen-en-antwoorden.md`, if any. */
async function readTeacherAnswers(
  quizFile: string,
): Promise<string | undefined> {
  if (!basename(quizFile).startsWith("quiz-")) return undefined;
  const teacherFile = quizFile.replace(
    /-vragen-en-antwoorden\.md$/,
    "-antwoorden-docent.md",
  );
  if (teacherFile === quizFile) return undefined;
  try {
    return await Deno.readTextFile(teacherFile);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}
