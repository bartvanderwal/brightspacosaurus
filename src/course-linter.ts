/** Offline checks for BSO-specific Markdown, complementary to Markdown style linters. */
import { basename, dirname, isAbsolute, relative, resolve } from "@std/path";
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
import { parseQuizMarkdown, validateQuiz } from "./quiz-parser.ts";
import { parseIncludeTarget } from "./markdown-converter.ts";
import { scanSources } from "./source-scanner.ts";
import type { ResolvedConfig } from "./types.ts";

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
}

/** Options shared by single-file and course linting. */
export interface LintOptions {
  /** Headings whose content must consist solely of term/definition lists. */
  flashcards?: FlashcardsConfig;
}

interface Node {
  type: string;
  name?: string;
  depth?: number;
  value?: string;
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

function compareDiagnostics(a: LintDiagnostic, b: LintDiagnostic): number {
  const compare = (x: string, y: string) => x < y ? -1 : x > y ? 1 : 0;
  return compare(a.sourceFile, b.sourceFile) || a.line - b.line ||
    a.column - b.column || compare(a.rule, b.rule);
}

function inspectMarkdown(
  markdown: string,
  sourceFile: string,
  options: LintOptions = {},
): { diagnostics: LintDiagnostic[]; includes: Include[] } {
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

  function walk(node: Node, containers: Node[] = []): void {
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
      const invalid = content.find((child) => !isFlashcardList(child));
      if (invalid || content.length === 0) {
        report(
          invalid ?? heading,
          "flashcard-section-content",
          `Section '${
            nodeText(heading)
          }' must contain only unordered lists of non-empty 'term: definition' items. Move prose, subheadings and other content outside this section.`,
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
    for (const issue of validateQuiz(parseQuizMarkdown(markdown))) {
      diagnostics.push({
        sourceFile,
        line: issue.line,
        column: 1,
        severity: "error",
        rule: issue.rule,
        message: `${
          issue.question !== undefined ? `Question ${issue.question}: ` : ""
        }${issue.message}`,
      });
    }
  }

  diagnostics.sort(compareDiagnostics);
  return { diagnostics, includes };
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
  for (
    const dir of new Set(
      (config.lint?.includeDirs ?? [config.sourcesDir, config.readersDir])
        .filter((dir): dir is string => Boolean(dir)),
    )
  ) {
    const scan = await scanSources({
      sourcesDir: dir,
      repoRoot: config.repoRoot,
    });
    for (
      const file of [
        ...scan.markdownFiles,
        ...scan.quizFiles,
        ...scan.readerFiles,
      ]
    ) files.add(file);
  }
  const visited = new Set<string>();
  const diagnostics: LintDiagnostic[] = [];
  async function check(file: string, ancestors: string[] = []): Promise<void> {
    if (visited.has(file)) return;
    visited.add(file);
    const result = inspectMarkdown(await Deno.readTextFile(file), file, {
      flashcards: config.flashcards,
    });
    diagnostics.push(...result.diagnostics);
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
      await check(target, [...ancestors, file]);
    }
  }
  for (const file of [...files].sort()) await check(file);
  diagnostics.sort(compareDiagnostics);
  return { filesChecked: visited.size, diagnostics };
}

/** Format an editor-friendly, one-line diagnostic. */
export function formatLintDiagnostic(
  diagnostic: LintDiagnostic,
  repoRoot: string,
): string {
  return `${
    relative(repoRoot, diagnostic.sourceFile)
  }:${diagnostic.line}:${diagnostic.column}: ${diagnostic.severity} ${diagnostic.rule}: ${diagnostic.message}`;
}
