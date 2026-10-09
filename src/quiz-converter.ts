/**
 * Converts quiz Markdown files to QTI 1.2 XML for Brightspace.
 *
 * Quiz files use a small Markdown convention with a title, numbered questions,
 * A-D answer options and `Correct answer: **X**` markers. The Dutch legacy
 * labels remain accepted for existing course material.
 *
 * @module
 */

import { basename, dirname, join, relative, resolve } from "@std/path";

import { assertValidQuiz, parseQuizMarkdown } from "./quiz-parser.ts";
import type { ParsedQuiz } from "./quiz-parser.ts";
export { parseQuizMarkdown } from "./quiz-parser.ts";
export type { ParsedQuiz, QuizQuestion } from "./quiz-parser.ts";

/** Options for converting a quiz Markdown file. */
export interface QuizConvertOptions {
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

function formatBrightspaceMaxAttempts(maxAttempts: number): string {
  return maxAttempts === 0 ? "unlimited" : String(maxAttempts);
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
): string {
  assertValidQuiz(quiz);
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
  xml += `    <section ident="${escapeXml(sectionIdent)}">\n`;

  for (const question of quiz.questions) {
    const qIdent = `q${question.number}`;
    const respIdent = `${qIdent}_resp`;
    const correctLabels = (question.correctAnswers ?? [question.correctAnswer])
      .filter(Boolean)
      .map((answer) => `${qIdent}_${answer.toLowerCase()}`);
    const questionType = question.responseType ?? "single";
    const multipleResponse = questionType === "multiple";

    xml += `      <item ident="${qIdent}">\n`;
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
    xml += `              <fieldentry>1</fieldentry>\n`;
    xml += `            </qtimetadatafield>\n`;
    xml += `          </qtimetadata>\n`;
    xml += `        </itemmetadata>\n`;
    xml += `        <presentation>\n`;
    xml += `          <material>\n`;
    xml += `            <mattext texttype="text/html">&lt;p&gt;${
      escapeXml(question.text)
    }&lt;/p&gt;</mattext>\n`;
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
          `              <response_label ident="${optIdent}"><material><mattext texttype="text/html">&lt;p&gt;${
            escapeXml(option.text)
          }&lt;/p&gt;</mattext></material></response_label>\n`;
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
    xml += `      </item>\n\n`;
  }

  xml += `    </section>\n`;
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
  const quiz = parseQuizMarkdown(content);
  assertValidQuiz(quiz, sourcePath);

  const filename = basename(sourcePath);
  const ident = deriveQuizIdent(filename);

  // Determine the relative path from the source directory for the output structure
  const resolvedSourcesDir = resolve(sourcesDir);
  const relFromSource = relative(resolvedSourcesDir, dirname(sourcePath));

  // Generate QTI XML
  const qtiXml = generateQtiXml(
    quiz,
    ident,
    options.maxAttempts ?? 0,
    options.shuffleAnswers ?? false,
  );

  // Write to output directory
  const outputSubDir = join(outputDir, relFromSource);
  await Deno.mkdir(outputSubDir, { recursive: true });

  const outputFilename = `qti-${ident.replace(/^quiz-/, "")}.xml`;
  const outputPath = join(outputSubDir, outputFilename);
  await Deno.writeTextFile(outputPath, qtiXml);

  return { outputPath };
}
