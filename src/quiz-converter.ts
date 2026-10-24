/**
 * Converts quiz Markdown files to QTI 1.2 XML for Brightspace.
 *
 * Quiz files use a small Markdown convention with a title, numbered questions,
 * A-D answer options and `Correct answer: **X**` markers. The Dutch legacy
 * labels remain accepted for existing course material.
 *
 * @module
 */

import { basename, dirname, extname, join, relative, resolve } from "@std/path";
import { unified } from "unified";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { rehypeQuizHighlight } from "./quiz-highlight.ts";

import { assertValidQuiz, parseQuizMarkdown } from "./quiz-parser.ts";
import type {
  ParsedQuiz,
  QuizHeadingOptions,
  QuizQuestion,
} from "./quiz-parser.ts";
import { parseQuizText } from "./quiz-markdown.ts";
import {
  diagramKey,
  isDiagramFence,
  questionId,
  quizDiagramFields,
} from "./quiz-diagram-fields.ts";
import { renderQuizDiagrams } from "./quiz-diagrams.ts";
import { resolveQuizOptions } from "./quiz-config.ts";
import type { ResolvedDiagramConfig } from "./types.ts";
export { parseQuizMarkdown } from "./quiz-parser.ts";
export type {
  ParsedQuiz,
  QuizAssignment,
  QuizBlock,
  QuizHeadingOptions,
  QuizQuestion,
  QuizValidationOptions,
} from "./quiz-parser.ts";

// Same mdast as the preview (quiz-markdown.ts); only the last step differs.
// Raw HTML typed by an author is still dropped (remark-rehype without
// allowDangerousHtml); only the `raw` nodes of rendered diagrams reach the output.
const quizHtmlProcessor = unified()
  .use(remarkRehype)
  // QTI has no stylesheet, so token colors are inlined (#103).
  .use(rehypeQuizHighlight)
  .use(rehypeStringify, { allowDangerousHtml: true });

function normalizeQuizDetails(markdown: string): string {
  let fence: { character: string; length: number } | undefined;
  return markdown.split(/\r?\n/).map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (
        fenceMatch?.[1][0] === fence.character &&
        fenceMatch[1].length >= fence.length &&
        !line.trim().slice(fenceMatch[0].trimStart().length).trim()
      ) {
        fence = undefined;
      }
      return line;
    }
    if (fenceMatch) {
      fence = {
        character: fenceMatch[1][0],
        length: fenceMatch[1].length,
      };
      return line;
    }
    return line
      .replace(/<summary\b[^>]*>(.*?)<\/summary>/gi, "**$1**")
      .replace(/<\/?summary\b[^>]*>/gi, "")
      .replace(/<\/?details\b[^>]*>/gi, "");
  }).join("\n");
}

/** Options for converting a quiz Markdown file. */
export interface QuizConvertOptions extends QuizHeadingOptions {
  /** Absolute path to the quiz Markdown source file. */
  sourcePath: string;
  /** Absolute path to the quiz output directory (build/brightspace/quiz/). */
  outputDir: string;
  /** Repository root for path calculation. */
  repoRoot: string;
  /** Source directory for relative path calculation. */
  sourcesDir: string;
  /** Maximum number of attempts for the generated Brightspace quiz. 0 means unlimited. */
  maxAttempts?: number;
  /** Allow the LMS to randomize answer order; source and XML order stay stable. */
  shuffleAnswers?: boolean;
  /** Renders PlantUML/Mermaid fences in questions (#101); without it they stay fenced code. */
  diagrams?: ResolvedDiagramConfig;
}

/** Result of the quiz conversion. */
export interface QuizConvertResult {
  /** Absolute path to the generated QTI XML file. */
  outputPath: string;
}

/**
 * Extracts the student-facing assessment title from generated QTI XML.
 * Returns the supplied fallback when the XML has no assessment title.
 */
export function extractAssessmentTitle(xml: string, fallback: string): string {
  const match = xml.match(/<assessment\b[^>]*\btitle="([^"]*)"/i);
  if (!match) return fallback;

  return match[1]
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Escapes XML special characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The rendered HTML of the n-th (1-based) diagram fence of a field, if there is one. */
type DiagramResolver = (ordinal: number) => string | undefined;

function renderQuizMarkdown(
  markdown: string,
  resolveImage?: (url: string) => string,
  resolveDiagram?: DiagramResolver,
): string {
  const parsed = parseQuizText(normalizeQuizDetails(markdown));
  if (resolveDiagram) {
    let ordinal = 0;
    const replaceDiagrams = (node: typeof parsed) => {
      if (isDiagramFence(node)) {
        const html = resolveDiagram(++ordinal);
        if (html !== undefined) {
          node.type = "bsoDiagram";
          delete node.lang;
          delete node.meta;
          delete node.value;
          node.data = {
            hName: "div",
            hProperties: { className: ["bso-quiz-diagram"] },
            hChildren: [{ type: "raw", value: html }],
          };
        }
      }
      for (const child of node.children ?? []) replaceDiagrams(child);
    };
    replaceDiagrams(parsed);
  }
  if (resolveImage) {
    const resolveImages = (node: typeof parsed) => {
      if (node.type === "image" && typeof node.url === "string") {
        node.url = resolveImage(node.url);
      }
      for (const child of node.children ?? []) resolveImages(child);
    };
    resolveImages(parsed);
  }
  // deno-lint-ignore no-explicit-any
  const tree = quizHtmlProcessor.runSync(parsed as any);
  // deno-lint-ignore no-explicit-any
  return String(quizHtmlProcessor.stringify(tree as any));
}

function formatBrightspaceMaxAttempts(maxAttempts: number): string {
  return maxAttempts === 0 ? "unlimited" : String(maxAttempts);
}

function imageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const visit = (node: ReturnType<typeof parseQuizText>) => {
    if (node.type === "image" && typeof node.url === "string") {
      urls.push(node.url);
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(parseQuizText(markdown));
  return urls;
}

function imagePathFromUrl(url: string): string | undefined {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url)) return undefined;
  let path = url.split(/[?#]/, 1)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    throw new Error(`Invalid image URL in quiz Markdown: '${url}'.`);
  }
  return path || undefined;
}

/**
 * Generates a quiz ident based on the file name.
 * E.g. "quiz-2.2-di-vragen-en-antwoorden.md" → "quiz-les-2-2-di"
 */
export function deriveQuizIdent(filename: string): string {
  // Remove the extension and the "vragen-en-antwoorden" suffix
  let name = filename.replace(/\.md$/, "");
  name = name.replace(/-vragen-en-antwoorden$/, "");
  // Replace dots with dashes for the ident
  name = name.replace(/\./g, "-");
  // Add "les-" after "quiz-"
  name = name.replace(/^quiz-/, "quiz-les-");
  return name;
}

/**
 * Generates QTI 1.2 XML from a parsed quiz.
 */
export function generateQtiXml(
  quiz: ParsedQuiz,
  ident: string,
  maxAttempts = 0,
  shuffleAnswers = false,
  resolveImage?: (url: string) => string,
  diagrams?: ReadonlyMap<string, string>,
): string {
  assertValidQuiz(quiz);
  const diagramsOf = (fieldId: string): DiagramResolver | undefined =>
    diagrams && ((ordinal) => diagrams.get(diagramKey(fieldId, ordinal)));
  const sectionIdent = `sectie-${ident.replace(/^quiz-/, "")}`;

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml +=
    `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_qtiasiv1p2p1_v1p0.xsd">\n`;
  xml += `  <assessment ident="${escapeXml(ident)}" title="${
    escapeXml(quiz.title)
  }">\n`;
  xml += `    <qtimetadata>\n`;
  xml += `      <qtimetadatafield>\n`;
  xml += `        <fieldlabel>cc_profile</fieldlabel>\n`;
  xml += `        <fieldentry>cc.exam.v0p1</fieldentry>\n`;
  xml += `      </qtimetadatafield>\n`;
  xml += `      <qtimetadatafield>\n`;
  xml += `        <fieldlabel>qmd_assessmenttype</fieldlabel>\n`;
  xml += `        <fieldentry>Examination</fieldentry>\n`;
  xml += `      </qtimetadatafield>\n`;
  xml += `      <qtimetadatafield>\n`;
  xml += `        <fieldlabel>cc_maxattempts</fieldlabel>\n`;
  xml += `        <fieldentry>${
    formatBrightspaceMaxAttempts(maxAttempts)
  }</fieldentry>\n`;
  xml += `      </qtimetadatafield>\n`;
  xml += `    </qtimetadata>\n\n`;
  const appendQuestion = (question: QuizQuestion) => {
    const qIdent = `q${question.number}`;
    const respIdent = `${qIdent}_resp`;
    const correctLabels = (question.correctAnswers ?? [question.correctAnswer])
      .filter(Boolean)
      .map((answer) => `${qIdent}_${answer.toLowerCase()}`);
    const questionType = question.responseType ?? "single";
    const multipleResponse = questionType === "multiple";

    xml += `      <item ident="${qIdent}"${
      question.title ? ` title="${escapeXml(question.title)}"` : ""
    }>\n`;
    xml += `        <itemmetadata>\n`;
    xml += `          <qtimetadata>\n`;
    xml += `            <qtimetadatafield>\n`;
    xml += `              <fieldlabel>cc_profile</fieldlabel>\n`;
    xml += `              <fieldentry>${
      questionType === "open_short"
        ? "cc.fib.v0p1"
        : multipleResponse
        ? "cc.multiple_response.v0p1"
        : "cc.multiple_choice.v0p1"
    }</fieldentry>\n`;
    xml += `            </qtimetadatafield>\n`;
    xml += `            <qtimetadatafield>\n`;
    xml += `              <fieldlabel>cc_weighting</fieldlabel>\n`;
    xml += `              <fieldentry>${question.points ?? 1}</fieldentry>\n`;
    xml += `            </qtimetadatafield>\n`;
    xml += `          </qtimetadata>\n`;
    xml += `        </itemmetadata>\n`;
    xml += `        <presentation>\n`;
    xml += `          <material>\n`;
    xml += `            <mattext texttype="text/html">${
      escapeXml(
        renderQuizMarkdown(
          question.text,
          resolveImage,
          diagramsOf(`${questionId(question)}.text`),
        ),
      )
    }</mattext>\n`;
    xml += `          </material>\n`;
    if (questionType === "open_short") {
      xml +=
        `          <response_str ident="${respIdent}" rcardinality="Single">\n`;
      xml += `            <render_fib fibtype="String" prompt="Box"${
        question.maxLength !== undefined
          ? ` maxchars="${question.maxLength}"`
          : ""
      } />\n`;
      xml += `          </response_str>\n`;
    } else {
      const hasForcedOrder = question.options.some((option) =>
        option.forcedOrder !== undefined
      );
      xml += `          <response_lid ident="${respIdent}" rcardinality="${
        multipleResponse ? "Multiple" : "Single"
      }">\n`;
      xml += `            <render_choice shuffle="${
        shuffleAnswers && !hasForcedOrder ? "Yes" : "No"
      }">\n`;

      for (const option of question.options) {
        const optIdent = `${qIdent}_${option.label.toLowerCase()}`;
        xml +=
          `              <response_label ident="${optIdent}"><material><mattext texttype="text/html">${
            escapeXml(
              renderQuizMarkdown(
                option.text,
                resolveImage,
                diagramsOf(`${questionId(question)}.option.${option.label}`),
              ),
            )
          }</mattext></material></response_label>\n`;
      }

      xml += `            </render_choice>\n`;
      xml += `          </response_lid>\n`;
    }
    xml += `        </presentation>\n`;
    xml += `        <resprocessing>\n`;
    xml +=
      `          <outcomes><decvar minvalue="0" maxvalue="100" varname="SCORE" vartype="Decimal" /></outcomes>\n`;
    if (questionType === "open_short") {
      for (const answer of question.acceptedAnswers ?? []) {
        xml += `          <respcondition continue="No">\n`;
        xml +=
          `            <conditionvar><varequal respident="${respIdent}" case="No">${
            escapeXml(answer)
          }</varequal></conditionvar>\n`;
        xml +=
          `            <setvar action="Set" varname="SCORE">100</setvar>\n`;
        xml += `          </respcondition>\n`;
      }
    } else {
      xml += `          <respcondition continue="No">\n`;
      if (multipleResponse) {
        const correctConditions = correctLabels.map((label) =>
          `<varequal respident="${respIdent}">${label}</varequal>`
        ).join("");
        const incorrectConditions = question.options
          .filter((option) =>
            !correctLabels.includes(
              `${qIdent}_${option.label.toLowerCase()}`,
            )
          )
          .map((option) =>
            `<not><varequal respident="${respIdent}">${qIdent}_${option.label.toLowerCase()}</varequal></not>`
          ).join("");
        xml +=
          `            <conditionvar><and>${correctConditions}${incorrectConditions}</and></conditionvar>\n`;
      } else {
        xml += `            <conditionvar><varequal respident="${respIdent}">${
          correctLabels[0]
        }</varequal></conditionvar>\n`;
      }
      xml += `            <setvar action="Set" varname="SCORE">100</setvar>\n`;
      xml += `          </respcondition>\n`;
    }
    xml += `        </resprocessing>\n`;
    if (question.hint) {
      xml +=
        `        <itemfeedback ident="${qIdent}_feedback"><flow_mat><material><mattext texttype="text/html">${
          escapeXml(
            renderQuizMarkdown(
              question.hint,
              resolveImage,
              diagramsOf(`${questionId(question)}.hint`),
            ),
          )
        }</mattext></material></flow_mat></itemfeedback>\n`;
    }
    if (question.explanation) {
      xml +=
        `        <itemfeedback ident="${qIdent}_explanation"><flow_mat><material><mattext texttype="text/html">${
          escapeXml(
            renderQuizMarkdown(
              question.explanation,
              resolveImage,
              diagramsOf(`${questionId(question)}.explanation`),
            ),
          )
        }</mattext></material></flow_mat></itemfeedback>\n`;
    }
    xml += `      </item>\n\n`;
  };

  const blocks = quiz.blocks ?? quiz.questions.map((question) => ({
    type: "question" as const,
    question,
  }));
  let looseSectionOpen = false;
  let looseSectionCount = 0;
  for (const [index, block] of blocks.entries()) {
    if (block.type === "question") {
      if (!looseSectionOpen) {
        const looseSectionIdent = looseSectionCount === 0
          ? sectionIdent
          : `${sectionIdent}_${index + 1}`;
        xml += `    <section ident="${escapeXml(looseSectionIdent)}">\n`;
        looseSectionCount++;
        looseSectionOpen = true;
      }
      appendQuestion(block.question);
      continue;
    }
    if (looseSectionOpen) {
      xml += `    </section>\n`;
      looseSectionOpen = false;
    }
    const assignment = block.assignment;
    const assignmentIdent = `${sectionIdent}_opdracht_${assignment.number}_${
      index + 1
    }`;
    xml += `    <section ident="${escapeXml(assignmentIdent)}" title="${
      escapeXml(assignment.title)
    }">\n`;
    if (assignment.text.trim()) {
      xml += `      <rubric view="All">\n`;
      xml += `        <material>\n`;
      xml += `          <mattext texttype="text/html">${
        escapeXml(
          renderQuizMarkdown(
            assignment.text,
            resolveImage,
            diagramsOf(`a${assignment.number}.text`),
          ),
        )
      }</mattext>\n`;
      xml += `        </material>\n`;
      xml += `      </rubric>\n`;
    }
    for (const part of assignment.questions) appendQuestion(part);
    xml += `    </section>\n`;
  }

  if (looseSectionOpen) xml += `    </section>\n`;
  xml += `  </assessment>\n`;
  xml += `</questestinterop>\n`;

  return xml;
}

/**
 * Converts a quiz Markdown file to QTI 1.2 XML.
 * Writes the result to build/brightspace/quiz/ preserving the source directory structure.
 */
export async function convertQuiz(
  options: QuizConvertOptions,
): Promise<QuizConvertResult> {
  const { sourcePath, outputDir, repoRoot: _repoRoot, sourcesDir } = options;

  // Read the source file
  const content = await Deno.readTextFile(sourcePath);

  // Parse the quiz
  const quiz = parseQuizMarkdown(content, options);
  assertValidQuiz(quiz, sourcePath, options);

  const filename = basename(sourcePath);
  const ident = deriveQuizIdent(filename);

  // Determine the relative path from the source directory for the output structure
  const resolvedSourcesDir = resolve(sourcesDir);
  const realSourcesDir = await Deno.realPath(resolvedSourcesDir);
  const relFromSource = relative(resolvedSourcesDir, dirname(sourcePath));
  const outputSubDir = join(outputDir, relFromSource);
  const imageAssets = new Map<string, string>();
  const markdownFields = [
    ...quiz.questions.flatMap((question) => [
      question.text,
      question.hint ?? "",
      ...question.options.map((option) => option.text),
    ]),
    ...(quiz.blocks ?? []).flatMap((block) =>
      block.type === "assignment" ? [block.assignment.text] : []
    ),
  ];
  for (const url of markdownFields.flatMap(imageUrls)) {
    const imagePath = imagePathFromUrl(url);
    if (!imagePath) continue;
    const sourceImage = resolve(dirname(sourcePath), imagePath);
    let realSourceImage: string;
    try {
      realSourceImage = await Deno.realPath(sourceImage);
    } catch {
      throw new Error(
        `${sourcePath}: referenced quiz image '${url}' does not exist.`,
      );
    }
    const sourceRelative = relative(realSourcesDir, realSourceImage);
    if (sourceRelative.startsWith("..")) {
      throw new Error(
        `${sourcePath}: quiz images must be inside the configured source directory: '${url}'.`,
      );
    }
    if (imageAssets.has(sourceImage)) continue;
    try {
      const info = await Deno.stat(realSourceImage);
      if (!info.isFile) throw new Error("not a file");
    } catch {
      throw new Error(
        `${sourcePath}: referenced quiz image '${url}' does not exist.`,
      );
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(sourceRelative.replaceAll("\\", "/")),
    );
    const hash = [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const assetRelative = join("assets", `${hash}${extname(sourceImage)}`);
    const assetOutput = join(outputSubDir, assetRelative);
    await Deno.mkdir(dirname(assetOutput), { recursive: true });
    await Deno.copyFile(realSourceImage, assetOutput);
    imageAssets.set(sourceImage, assetRelative.replaceAll("\\", "/"));
  }
  const resolveImage = (url: string) => {
    const imagePath = imagePathFromUrl(url);
    if (!imagePath) return url;
    const sourceImage = resolve(dirname(sourcePath), imagePath);
    const assetRelative = imageAssets.get(sourceImage);
    const suffix = url.match(/[?#].*$/)?.[0] ?? "";
    return assetRelative ? `${assetRelative}${suffix}` : url;
  };

  // Diagrams are rendered first (async, Kroki); the XML generator stays synchronous.
  const diagrams = options.diagrams
    ? await renderQuizDiagrams(
      quizDiagramFields(quiz, resolveQuizOptions(options)),
      options.diagrams,
      sourcePath,
      outputSubDir,
    )
    : undefined;

  // Generate QTI XML
  const qtiXml = generateQtiXml(
    quiz,
    ident,
    options.maxAttempts ?? 0,
    options.shuffleAnswers ?? false,
    resolveImage,
    diagrams,
  );

  // Write to output directory
  await Deno.mkdir(outputSubDir, { recursive: true });

  const outputFilename = `qti-${ident.replace(/^quiz-/, "")}.xml`;
  const outputPath = join(outputSubDir, outputFilename);
  await Deno.writeTextFile(outputPath, qtiXml);

  return { outputPath };
}
