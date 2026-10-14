/**
 * Runtime-neutral helpers for diagrams in quiz questions (#101): which fences
 * there are, their accessible titles and the stable ids of the quiz fields.
 * The Docusaurus preview (Node) and the QTI export (Deno) both use this, so a
 * diagram has the same title in both. No Deno or Node APIs here.
 *
 * @module
 */
import { SUPPORTED_DIAGRAM_LANGUAGES } from "./diagram-config.ts";
import type { QuizMarkdownNode } from "./quiz-markdown.ts";
import type { ParsedQuiz, QuizQuestion } from "./quiz-parser.ts";
import type { ResolvedQuizConfig } from "./types.ts";

/** A diagram fence node of the mdast of quiz text. */
export function isDiagramFence(node: QuizMarkdownNode): boolean {
  return node.type === "code" &&
    SUPPORTED_DIAGRAM_LANGUAGES.includes(
      node.lang as typeof SUPPORTED_DIAGRAM_LANGUAGES[number],
    );
}

/** The diagram fences of an mdast tree, in document order. */
export function diagramFences(root: QuizMarkdownNode): QuizMarkdownNode[] {
  const fences: QuizMarkdownNode[] = [];
  const visit = (node: QuizMarkdownNode) => {
    if (isDiagramFence(node)) fences.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return fences;
}

/**
 * Gives every diagram fence without an `imgTitle` the title of the question it
 * belongs to. Without it the plugin would use the nearest heading or
 * `plantuml diagram 1`, which tells a screen-reader user nothing. An author's
 * own `imgTitle` always wins. Preview and export both call this, so the alt
 * text is the same in both.
 */
export function titleDiagramFences(
  nodes: QuizMarkdownNode[],
  title: string,
): void {
  for (const node of nodes) {
    for (const fence of diagramFences(node)) {
      const meta = typeof fence.meta === "string" ? fence.meta : "";
      if (/\bimgTitle=/.test(meta)) continue;
      fence.meta = [meta, `imgTitle="${title.replaceAll('"', "'")}"`]
        .filter(Boolean).join(" ");
    }
  }
}

/** A piece of quiz Markdown that can hold diagrams, with its stable id and title. */
export interface QuizDiagramField {
  /** Stable id: `q3.text`, `q3.option.B`, `q3.hint`, `q3.explanation`, `a2.text`. */
  id: string;
  markdown: string;
  /** Accessible title of the diagrams in this field. */
  title: string;
  /** One-based line of the question's heading in the quiz file, when known. */
  line?: number;
}

/** The id of the n-th (1-based) diagram of a field. */
export function diagramKey(fieldId: string, ordinal: number): string {
  return `${fieldId}#${ordinal}`;
}

/** Id of a question, unique across the quiz (assignment parts carry a letter). */
export function questionId(question: QuizQuestion): string {
  return `q${question.number}${question.label ?? ""}`;
}

/** The heading label of a question, as the preview shows it (`Vraag 3`, `Deelvraag a`). */
export function questionLabel(
  question: QuizQuestion,
  config: Pick<ResolvedQuizConfig, "questionPrefix" | "subquestionPrefix">,
): string {
  return question.label
    ? `${config.subquestionPrefix} ${question.label}`
    : `${config.questionPrefix} ${question.number}`;
}

const PART_LABELS = {
  nl: { option: "antwoord", hint: "hint", explanation: "toelichting" },
  en: { option: "answer", hint: "hint", explanation: "explanation" },
} as const;

/**
 * All Markdown fields of a quiz that are rendered to HTML, in a fixed order.
 * The QTI generator and the diagram renderer both use this list, so a diagram
 * is found again by the id it was rendered under.
 */
export function quizDiagramFields(
  quiz: ParsedQuiz,
  config: ResolvedQuizConfig,
): QuizDiagramField[] {
  const part = PART_LABELS[config.locale];
  const fields: QuizDiagramField[] = [];
  const addQuestion = (question: QuizQuestion) => {
    const id = questionId(question);
    const label = questionLabel(question, config);
    fields.push({ id: `${id}.text`, markdown: question.text, title: label, line: question.line });
    for (const option of question.options) {
      fields.push({
        id: `${id}.option.${option.label}`,
        markdown: option.text,
        title: `${label}, ${part.option} ${option.label}`,
        line: question.line,
      });
    }
    if (question.hint) {
      fields.push({
        id: `${id}.hint`,
        markdown: question.hint,
        title: `${label}, ${part.hint}`,
        line: question.line,
      });
    }
    if (question.explanation) {
      fields.push({
        id: `${id}.explanation`,
        markdown: question.explanation,
        title: `${label}, ${part.explanation}`,
        line: question.line,
      });
    }
  };
  for (const block of quiz.blocks ?? quiz.questions.map((question) => ({ type: "question" as const, question }))) {
    if (block.type === "question") {
      addQuestion(block.question);
      continue;
    }
    fields.push({
      id: `a${block.assignment.number}.text`,
      markdown: block.assignment.text,
      title: `${config.assignmentPrefix} ${block.assignment.number}`,
    });
    block.assignment.questions.forEach(addQuestion);
  }
  return fields;
}
