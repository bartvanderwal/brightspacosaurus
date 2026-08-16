/**
 * QuizConverter: zet quiz-Markdown bestanden om naar QTI 1.2 XML.
 * Quiz-bestanden worden herkend aan het prefix "quiz-" in de bestandsnaam.
 * Het verwachte formaat: `# Titel`, `## Vraag N`, 4 opties (A–D), `Correct antwoord: **X**`
 * Requirements: 2.3
 */

import { basename, dirname, join, relative, resolve } from "@std/path";

/** Een geparseerde quizvraag. */
export interface QuizQuestion {
  number: number;
  text: string;
  options: { label: string; text: string }[];
  correctAnswer: string; // "A", "B", "C" of "D"
}

/** Een geparseerde quiz. */
export interface ParsedQuiz {
  title: string;
  questions: QuizQuestion[];
}

/** Opties voor het converteren van een quiz-Markdown bestand. */
export interface QuizConvertOptions {
  /** Absoluut pad naar het quiz-Markdown bronbestand. */
  sourcePath: string;
  /** Absoluut pad naar de quiz-uitvoermap (build/brightspace/quiz/). */
  outputDir: string;
  /** Repository-root voor padberekening. */
  repoRoot: string;
  /** Bronmap voor relatieve padberekening. */
  sourcesDir: string;
}

/** Resultaat van de quiz-conversie. */
export interface QuizConvertResult {
  /** Absoluut pad naar het gegenereerde QTI XML-bestand. */
  outputPath: string;
}

/**
 * Parseer een quiz-Markdown bestand naar een gestructureerd object.
 */
export function parseQuizMarkdown(content: string): ParsedQuiz {
  const lines = content.split("\n");
  let title = "";
  const questions: QuizQuestion[] = [];
  let currentQuestion: Partial<QuizQuestion> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Titel: # Quiz X.Y - Onderwerp
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      title = line.slice(2).trim();
      continue;
    }

    // Nieuwe vraag: ## Vraag N
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

    // Antwoordoptie: - A. tekst of - B. tekst etc.
    const optionMatch = line.match(/^- ([A-D])\.\s+(.+)/);
    if (optionMatch) {
      currentQuestion.options = currentQuestion.options || [];
      currentQuestion.options.push({
        label: optionMatch[1],
        text: optionMatch[2].trim(),
      });
      continue;
    }

    // Correct antwoord: **X**
    const correctMatch = line.match(/^Correct antwoord:\s*\*\*([A-D])\*\*/);
    if (correctMatch) {
      currentQuestion.correctAnswer = correctMatch[1];
      continue;
    }

    // Vraagtekst: niet-lege regels na ## Vraag N, voor de opties
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

  // Voeg de laatste vraag toe
  if (currentQuestion && currentQuestion.number !== undefined) {
    questions.push(currentQuestion as QuizQuestion);
  }

  return { title, questions };
}

/**
 * Escape XML-speciale tekens.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Genereer een quiz-ident op basis van de bestandsnaam.
 * Bijv. "quiz-2.2-di-vragen-en-antwoorden.md" → "quiz-les-2-2-di"
 */
export function deriveQuizIdent(filename: string): string {
  // Verwijder extensie en "vragen-en-antwoorden" suffix
  let name = filename.replace(/\.md$/, "");
  name = name.replace(/-vragen-en-antwoorden$/, "");
  // Vervang punten door streepjes voor de ident
  name = name.replace(/\./g, "-");
  // Voeg "les-" toe na "quiz-"
  name = name.replace(/^quiz-/, "quiz-les-");
  return name;
}

/**
 * Genereer QTI 1.2 XML uit een geparseerde quiz.
 */
export function generateQtiXml(quiz: ParsedQuiz, ident: string): string {
  const sectionIdent = `sectie-${ident.replace(/^quiz-/, "")}`;

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_qtiasiv1p2p1_v1p0.xsd">\n`;
  xml += `  <assessment ident="${escapeXml(ident)}" title="${escapeXml(quiz.title)}">\n`;
  xml += `    <qtimetadata>\n`;
  xml += `      <qtimetadatafield>\n`;
  xml += `        <fieldlabel>cc_profile</fieldlabel>\n`;
  xml += `        <fieldentry>cc.exam.v0p1</fieldentry>\n`;
  xml += `      </qtimetadatafield>\n`;
  xml += `      <qtimetadatafield>\n`;
  xml += `        <fieldlabel>qmd_assessmenttype</fieldlabel>\n`;
  xml += `        <fieldentry>Examination</fieldentry>\n`;
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
    xml += `            <mattext texttype="text/html">&lt;p&gt;${escapeXml(question.text)}&lt;/p&gt;</mattext>\n`;
    xml += `          </material>\n`;
    xml += `          <response_lid ident="${respIdent}" rcardinality="Single">\n`;
    xml += `            <render_choice>\n`;

    for (const option of question.options) {
      const optIdent = `${qIdent}_${option.label.toLowerCase()}`;
      xml += `              <response_label ident="${optIdent}"><material><mattext texttype="text/html">&lt;p&gt;${escapeXml(option.text)}&lt;/p&gt;</mattext></material></response_label>\n`;
    }

    xml += `            </render_choice>\n`;
    xml += `          </response_lid>\n`;
    xml += `        </presentation>\n`;
    xml += `        <resprocessing>\n`;
    xml += `          <outcomes><decvar minvalue="0" maxvalue="100" varname="SCORE" vartype="Decimal" /></outcomes>\n`;
    xml += `          <respcondition continue="No">\n`;
    xml += `            <conditionvar><varequal respident="${respIdent}">${correctLabel}</varequal></conditionvar>\n`;
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
 * Converteer een quiz-Markdown bestand naar QTI 1.2 XML.
 * Schrijft het resultaat naar build/brightspace/quiz/ met de bronmapstructuur.
 */
export async function convertQuiz(options: QuizConvertOptions): Promise<QuizConvertResult> {
  const { sourcePath, outputDir, repoRoot: _repoRoot, sourcesDir } = options;

  // Lees het bronbestand
  const content = await Deno.readTextFile(sourcePath);

  // Parseer de quiz
  const quiz = parseQuizMarkdown(content);

  if (quiz.questions.length === 0) {
    const err = new Error(`Geen vragen gevonden in quiz-bestand: ${sourcePath}`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }

  // Bepaal de ident en uitvoerbestandsnaam
  const filename = basename(sourcePath);
  const ident = deriveQuizIdent(filename);

  // Bepaal het relatieve pad vanuit de bronmap voor de uitvoerstructuur
  const resolvedSourcesDir = resolve(sourcesDir);
  const relFromSource = relative(resolvedSourcesDir, dirname(sourcePath));

  // Genereer QTI XML
  const qtiXml = generateQtiXml(quiz, ident);

  // Schrijf naar uitvoermap
  const outputSubDir = join(outputDir, relFromSource);
  await Deno.mkdir(outputSubDir, { recursive: true });

  const outputFilename = `qti-${ident.replace(/^quiz-/, "")}.xml`;
  const outputPath = join(outputSubDir, outputFilename);
  await Deno.writeTextFile(outputPath, qtiXml);

  return { outputPath };
}
