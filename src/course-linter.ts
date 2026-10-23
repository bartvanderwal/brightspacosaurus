/**
 * Offline checks for BSO-specific Markdown, complementary to Markdown style linters.
 *
 * @module
 */
import { isSlideDeck } from "./includes.ts";
import {
  findEmptySlideSeparators,
  headingDividerLevels,
} from "./slide-separators.ts";
import {
  basename,
  dirname,
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
  // like the Docusaurus sidebar); any other key is ignored by BSO (#106).
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
  // matter holds Marp directives, so it is not a lesson page (#141).
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
      ...new Set(keys.filter((key) => key !== "sidebar_position")),
    ];
    if (ignored.length > 0) {
      report(
        frontmatter,
        "lesson-frontmatter",
        `YAML frontmatter key${ignored.length > 1 ? "s" : ""} ${
          ignored.map((key) => `'${key}'`).join(", ")
        } ${
          ignored.length > 1 ? "are" : "is"
        } ignored in lesson pages; only 'sidebar_position' is used (menu order). Put the title as '# heading' and remove the rest.`,
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

  // Three or more `../` in a row: the path breaks when the file moves. Links,
  // images and `{@include}` targets (which parse as links) are all checked.
  function checkDeepRelativePath(node: Node): void {
    const path = (node.url ?? "").split(/[?#]/, 1)[0];
    if (!/(?:^|[\\/])\.\.[\\/]\.\.[\\/]\.\.(?:[\\/]|$)/.test(path)) return;
    report(
      node,
      "deep-relative-path",
      `Avoid going up three or more folders with '../' in '${path}'; move the file closer or into a shared folder inside sourcesDir, to avoid brittle file paths.`,
      "warning",
    );
  }

  // A `---` that gives Marp an empty slide (#141). Only decks are checked: a
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
          : "This '---' gives an empty slide: it is followed by nothing or by another '---', or it opens the deck. Remove it.",
      });
    }
  }

  // A lesson that becomes slides gets one slide per `##` section and a contents
  // slide: numbered headings and at most nine sections keep that readable.
  function checkGeneratedSlides(): void {
    if (!options.generatedSlides) return;
    const sections = ((tree as Node).children ?? []).filter((node) =>
      node.type === "heading" && node.depth === 2
    );
    const unnumbered = sections.filter((heading) =>
      !/^\d+(?:\.\d+)*\.?\s+\S/.test(nodeText(heading).trim())
    );
    if (unnumbered.length > 0) {
      report(
        unnumbered[0],
        "slides-unnumbered-headings",
        `${unnumbered.length} of ${sections.length} section headings ('##') have no number, such as '## 1. Introduction'. This lesson becomes slides, and the contents slide and the slides themselves are easier to follow with numbered sections.`,
        "warning",
      );
    }
    if (sections.length > 9) {
      report(
        sections[9],
        "slides-too-many-sections",
        `This lesson becomes slides and has ${sections.length} sections ('##'); more than 9 makes a long contents slide and a long deck. Split the lesson or merge sections.`,
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

/**
 * The lesson files that are turned into slides: those with `generate: true` in
 * `slides.lessons`, and the files whose name starts with `slides.generateForPrefix`
 * (unless a mapping says `generate: false` or gives only a deck).
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
      // Slides expand an include one level deep; an include inside it stays a directive (#143).
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
            `Slides expand an include one level deep: the {@include} inside ${include.target} is not expanded on the slides. Put that include in this deck, or merge the files.`,
        });
      }
      await check(target, [...ancestors, file]);
    }
  }
  for (const file of [...files].sort()) await check(file);
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
