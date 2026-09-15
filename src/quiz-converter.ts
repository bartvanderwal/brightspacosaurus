/**
 * Converts quiz Markdown files to QTI 1.2 XML for Brightspace.
 *
 * Quiz files use a small Markdown convention with a title, numbered questions,
 * A-D answer options and `Correct antwoord: **X**` markers.
 *
 * @module
 */

import { basename, dirname, join, relative, resolve } from "@std/path";

/** A parsed quiz question. */
export interface QuizQuestion {
  number: number;
  text: string;
  options: { label: string; text: string }[];
  correctAnswer: string; // "A", "B", "C" or "D"
}

/** A parsed quiz. */
export interface ParsedQuiz {
  title: string;
  questions: QuizQuestion[];
}

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
 * Parses a quiz Markdown file into a structured object.
 */
export function parseQuizMarkdown(content: string): ParsedQuiz {
  const lines = content.split("\n");
  let title = "";
  const questions: QuizQuestion[] = [];
  let currentQuestion: Partial<QuizQuestion> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Title: # Quiz X.Y - Topic
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      title = line.slice(2).trim();
      continue;
    }

    // New question: ## Vraag N
    const questionMatch = line.match(/^## Vraag (\d+)/);
    if (questionMatch) {
      if (currentQuestion && currentQuestion.number !== undefined) {
        questions.push(currentQuestion as QuizQuestion);
      }
      currentQuestion = {
        number: parseInt(questionMatch[1]),
        text: "",
        options: [],
        correctAnswer: "",
      };
      continue;
    }

    if (!currentQuestion) continue;

    // Answer option: - A. text or - B. text etc.
    const optionMatch = line.match(/^- ([A-D])\.\s+(.+)/);
    if (optionMatch) {
      currentQuestion.options = currentQuestion.options || [];
      currentQuestion.options.push({
        label: optionMatch[1],
        text: optionMatch[2].trim(),
      });
      continue;
    }

    // Correct answer: **X**
    const correctMatch = line.match(/^Correct antwoord:\s*\*\*([A-D])\*\*/);
    if (correctMatch) {
      currentQuestion.correctAnswer = correctMatch[1];
      continue;
    }

    // Question text: non-empty lines after ## Vraag N, before the options
    if (
      currentQuestion.number !== undefined &&
      (!currentQuestion.options || currentQuestion.options.length === 0) &&
      line.trim() !== ""
    ) {
      if (currentQuestion.text) {
        currentQuestion.text += " " + line.trim();
      } else {
        currentQuestion.text = line.trim();
      }
    }
  }

  // Add the last question
  if (currentQuestion && currentQuestion.number !== undefined) {
    questions.push(currentQuestion as QuizQuestion);
  }

  return { title, questions };
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
): string {
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
    const correctLabel = `${qIdent}_${question.correctAnswer.toLowerCase()}`;

    xml += `      <item ident="${qIdent}">\n`;
    xml += `        <itemmetadata>\n`;
    xml += `          <qtimetadata>\n`;
    xml += `            <qtimetadatafield>\n`;
    xml += `              <fieldlabel>cc_profile</fieldlabel>\n`;
    xml += `              <fieldentry>cc.multiple_choice.v0p1</fieldentry>\n`;
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
    xml +=
      `          <response_lid ident="${respIdent}" rcardinality="Single">\n`;
    xml += `            <render_choice>\n`;

    for (const option of question.options) {
      const optIdent = `${qIdent}_${option.label.toLowerCase()}`;
      xml +=
        `              <response_label ident="${optIdent}"><material><mattext texttype="text/html">&lt;p&gt;${
          escapeXml(option.text)
        }&lt;/p&gt;</mattext></material></response_label>\n`;
    }

    xml += `            </render_choice>\n`;
    xml += `          </response_lid>\n`;
    xml += `        </presentation>\n`;
    xml += `        <resprocessing>\n`;
    xml +=
      `          <outcomes><decvar minvalue="0" maxvalue="100" varname="SCORE" vartype="Decimal" /></outcomes>\n`;
    xml += `          <respcondition continue="No">\n`;
    xml +=
      `            <conditionvar><varequal respident="${respIdent}">${correctLabel}</varequal></conditionvar>\n`;
    xml += `            <setvar action="Set" varname="SCORE">100</setvar>\n`;
    xml += `          </respcondition>\n`;
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

  if (quiz.questions.length === 0) {
    const err = new Error(`No questions found in quiz file: ${sourcePath}`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }

  // Determine the ident and output file name
  const filename = basename(sourcePath);
  const ident = deriveQuizIdent(filename);

  // Determine the relative path from the source directory for the output structure
  const resolvedSourcesDir = resolve(sourcesDir);
  const relFromSource = relative(resolvedSourcesDir, dirname(sourcePath));

  // Generate QTI XML
  const qtiXml = generateQtiXml(quiz, ident, options.maxAttempts ?? 0);

  // Write to output directory
  const outputSubDir = join(outputDir, relFromSource);
  await Deno.mkdir(outputSubDir, { recursive: true });

  const outputFilename = `qti-${ident.replace(/^quiz-/, "")}.xml`;
  const outputPath = join(outputSubDir, outputFilename);
  await Deno.writeTextFile(outputPath, qtiXml);

  return { outputPath };
}
