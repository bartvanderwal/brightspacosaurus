/** Shared, runtime-independent quiz parsing and export validation. */

/** A source-located error that would make a quiz invalid or ungradable. */
export interface QuizIssue {
  /** Stable validation rule. */
  rule: string;
  /** One-based source line when parsed from Markdown. */
  line: number;
  /** Question number, when the problem concerns a question. */
  question?: number;
  /** Actionable validation message. */
  message: string;
  /** Warnings are lint findings, but do not block quiz export. */
  severity?: "error" | "warning";
}

/** A parsed multiple-choice question. */
export interface QuizQuestion {
  /** Question number used in stable QTI identifiers. */
  number: number;
  /** Student-facing prompt. */
  text: string;
  /** Free text after the number in a legacy heading, such as 'Bella' or '(optioneel)'. */
  title?: string;
  /** Stable labels and their corresponding answer texts. */
  options: { label: string; text: string; forcedOrder?: number }[];
  /** Uppercase first correct label, retained for single-answer consumers. */
  correctAnswer: string;
  /** All correct labels for multiple-response questions. */
  correctAnswers?: string[];
  /** The response model represented by this question. */
  responseType?: "single" | "multiple" | "open_short";
  /** Accepted strings for an auto-graded open short-answer question. */
  acceptedAnswers?: string[];
  /** Maximum input length for an open short-answer question. */
  maxLength?: number;
  /** Author-facing label for a question, such as `27a`. */
  label?: string;
  /** Maximum score for this question, when explicitly set. */
  points?: number;
  /** Optional student-facing hint. */
  hint?: string;
  /** Markdown explanation shown after the answer ('### Toelichting' in heading form). */
  explanation?: string;
  /** One-based heading line, if parsed from Markdown. */
  line?: number;
}

/** A group of questions that share one student-facing Markdown context. */
export interface QuizAssignment {
  /** Author-supplied assignment number. */
  number: number;
  /** Heading text for the assignment. */
  title: string;
  /** Markdown shown once before all of the assignment's questions. */
  text: string;
  /** Questions belonging to the assignment, in source order. */
  questions: QuizQuestion[];
  /** One-based heading line, if parsed from Markdown. */
  line?: number;
}

/** An ordered, format-independent top-level quiz content block. */
export type QuizBlock =
  | { type: "question"; question: QuizQuestion }
  | { type: "assignment"; assignment: QuizAssignment };

/** Quiz model shared by lint, QTI export and Docusaurus preview. */
export interface ParsedQuiz {
  /** Student-facing quiz title. */
  title: string;
  /** Questions in author order. */
  questions: QuizQuestion[];
  /** Ordered standalone questions and shared-context assignments. */
  blocks?: QuizBlock[];
  /** Syntax errors found while parsing; export must reject these. */
  issues?: QuizIssue[];
}

/** Heading prefixes that select the legacy grouped-question syntax. */
export interface QuizHeadingOptions {
  locale?: "en" | "nl";
  assignmentPrefix?: string;
  questionPrefix?: string;
}

export type QuizValidationOptions = QuizHeadingOptions;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function headingTail(
  line: string,
  depth: number,
  prefix: string,
): string | null {
  const match = line.match(
    new RegExp(
      `^#{${depth}}\\s+${escapeRegExp(prefix)}(?=\\s|$)(.*)$`,
      "i",
    ),
  );
  return match?.[1] ?? null;
}

/** Parse documented English/Dutch labels independently of bold or code formatting. */
export function parseQuizMarkdown(
  content: string,
  options: QuizHeadingOptions = {},
): ParsedQuiz {
  const quizDownBlock = extractQuizDownBlock(content);
  if (quizDownBlock !== null) {
    const quiz = parseQuizDown(quizDownBlock.body, content);
    // Report lines in the file, not in the block.
    const shift = (line: number) => line + quizDownBlock.startLine - 1;
    for (const issue of quiz.issues!) issue.line = shift(issue.line);
    for (const question of quiz.questions) {
      if (question.line !== undefined) question.line = shift(question.line);
    }
    for (const block of quiz.blocks ?? []) {
      if (block.type === "assignment" && block.assignment.line !== undefined) {
        block.assignment.line = shift(block.assignment.line);
      }
    }
    return quiz;
  }
  if (hasQuizDownHeadings(content)) {
    const converted = quizDownFromHeadings(content);
    const quiz = parseQuizDown(converted.source, content);
    quiz.issues = [...converted.issues, ...quiz.issues!].sort((a, b) =>
      a.line - b.line
    );
    return quiz;
  }

  const quiz: ParsedQuiz = { title: "", questions: [], blocks: [], issues: [] };
  let question: QuizQuestion | undefined;
  let assignment: QuizAssignment | undefined;
  const assignmentPrefixes = [
    ...new Set([
      options.assignmentPrefix?.trim(),
      options.locale === "nl" ? "Opdracht" : "Assignment",
      "Assignment",
      "Opdracht",
    ]
      .filter((value): value is string => Boolean(value))),
  ];
  const questionPrefixes = [
    ...new Set([
      options.questionPrefix?.trim(),
      options.locale === "nl" ? "Deelvraag" : "Question",
      "Question",
      "Vraag",
      "Deelvraag",
      "Subquestion",
    ].filter((value): value is string => Boolean(value))),
  ];
  let answerSeen = false;
  let checkboxOptionCount = 0;
  let regularOptionCount = 0;
  let fence: { character: string; length: number } | undefined;
  const issue = (rule: string, line: number, message: string) => {
    quiz.issues!.push({ rule, line, question: question?.number, message });
  };
  const nextQuestionNumber = () => {
    let number = quiz.questions.length + 1;
    while (quiz.questions.some((item) => item.number === number)) number++;
    return number;
  };
  const startQuestion = (
    line: number,
    label?: string,
    points?: number,
    number?: number,
  ): QuizQuestion => {
    question = {
      number: number ?? nextQuestionNumber(),
      text: "",
      options: [],
      correctAnswer: "",
      line,
      ...(label ? { label } : {}),
      ...(points === undefined ? {} : { points }),
    };
    quiz.questions.push(question);
    if (assignment) assignment.questions.push(question);
    else quiz.blocks!.push({ type: "question", question });
    answerSeen = false;
    checkboxOptionCount = 0;
    regularOptionCount = 0;
    return question;
  };

  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      if (!fence) {
        fence = { character: fenceMatch[1][0], length: fenceMatch[1].length };
        if (question && !question.options.length) {
          question.text += `${question.text ? "\n" : ""}${raw}`;
        } else if (assignment && !question) {
          assignment.text += `${assignment.text ? "\n" : ""}${raw}`;
        }
      } else if (
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()
      ) {
        fence = undefined;
        if (question && !question.options.length) {
          question.text += `\n${raw}`;
        } else if (assignment && !question) {
          assignment.text += `${assignment.text ? "\n" : ""}${raw}`;
        }
      }
      continue;
    }
    if (fence) {
      // A fenced example must never supply an answer key or question heading.
      if (question && !question.options.length) {
        question.text += `${question.text ? "\n" : ""}${raw}`;
      } else if (assignment && !question) {
        assignment.text += `${assignment.text ? "\n" : ""}${raw}`;
      }
      continue;
    }
    if (line.startsWith("# ")) {
      const misplacedPrefix = assignmentPrefixes.find((prefix) =>
        headingTail(line, 1, prefix)?.match(/^\s+\d+\b/)
      ) ??
        questionPrefixes.find((prefix) =>
          headingTail(line, 1, prefix)?.match(/^\s+\d+[a-z]?\b/i)
        );
      if (misplacedPrefix) {
        quiz.issues!.push({
          rule: "quiz-heading-level",
          line: index + 1,
          message:
            `Quiz heading '${misplacedPrefix}' is at level 1; use level 2 for assignments or standalone questions, or level 3 for assignment subquestions.`,
        });
      }
      if (!quiz.title) {
        quiz.title = line.slice(2).trim();
      }
      continue;
    }
    const prefixTail = (depth: number, prefixes: string[]) => {
      for (const prefix of prefixes) {
        const tail = headingTail(line, depth, prefix);
        if (tail !== null) return { prefix, tail };
      }
      return null;
    };
    const assignmentAtH2 = prefixTail(2, assignmentPrefixes);
    const questionAtH2 = prefixTail(2, questionPrefixes);
    const questionAtH3 = prefixTail(3, questionPrefixes);
    const headingDepth = line.match(/^(#{2,6})\s/)?.[1].length;
    const assignmentAtCurrentLevel = headingDepth === undefined
      ? null
      : prefixTail(headingDepth, assignmentPrefixes);
    const questionAtCurrentLevel = headingDepth === undefined
      ? null
      : prefixTail(headingDepth, questionPrefixes);

    if (assignmentAtCurrentLevel && headingDepth !== 2) {
      question = undefined;
      assignment = undefined;
      quiz.issues!.push({
        rule: "quiz-heading-level",
        line: index + 1,
        message:
          `Assignment headings must use level 2 (##), not level ${headingDepth} (#${
            "#".repeat(headingDepth! - 1)
          }).`,
      });
      continue;
    }
    if (questionAtCurrentLevel && headingDepth! > 3) {
      question = undefined;
      assignment = undefined;
      quiz.issues!.push({
        rule: "quiz-heading-level",
        line: index + 1,
        message:
          `Question headings must use level 2 (##) for standalone questions or level 3 (###) in assignments, not level ${headingDepth}.`,
      });
      continue;
    }
    if (assignmentAtH2) {
      question = undefined;
      const detail = assignmentAtH2.tail.match(
        /^\s+(\d+)\b(?:\s*[-—:]\s*(.*))?\s*$/,
      );
      if (!detail) {
        assignment = undefined;
        quiz.issues!.push({
          rule: "quiz-heading-syntax",
          line: index + 1,
          message:
            `Use '## ${assignmentAtH2.prefix} N' for an assignment heading.`,
        });
        continue;
      }
      const number = Number(detail[1]);
      assignment = {
        number,
        title: detail[2]
          ? `${assignmentAtH2.prefix} ${detail[1]} — ${detail[2].trim()}`
          : `${assignmentAtH2.prefix} ${detail[1]}`,
        text: "",
        questions: [],
        line: index + 1,
      };
      quiz.blocks!.push({ type: "assignment", assignment });
      continue;
    }
    if (questionAtH3 || questionAtH2) {
      const nested = questionAtH3 !== null;
      const heading = nested ? questionAtH3! : questionAtH2!;
      const detail = heading.tail.match(
        /^\s+(\d+[a-z]?|[a-z])(?:\s*\((\d+)(?:\s*pt)?\))?(?:\s*[-—:]\s*(.*)|\s+(.+))?\s*$/i,
      );
      // '(2 punten)' must not pass as a title: points are '(2 pt)' or '(2)'.
      if (!detail || (detail[4] && /^\(\s*\d/.test(detail[4]))) {
        if (!nested) assignment = undefined;
        quiz.issues!.push({
          rule: "quiz-heading-syntax",
          line: index + 1,
          message: `Use '${
            nested ? "###" : "##"
          } ${heading.prefix} N' for a question heading; points go in the heading as '(2 pt)' or '(2)'.`,
        });
        question = undefined;
        continue;
      }
      const label = detail[1].match(/[a-z]$/i) ? detail[1] : undefined;
      const points = detail[2] ? Number(detail[2]) : undefined;
      if (nested && assignment) {
        assignment.text = assignment.text.trim();
      } else {
        if (
          (nested && !assignment) || label ||
          /^(?:Deelvraag|Subquestion)$/i.test(heading.prefix)
        ) {
          quiz.issues!.push({
            rule: "quiz-subquestion-without-assignment",
            line: index + 1,
            message: `Subquestion '${
              detail[1]
            }' has no assignment: put it under '## ${
              options.locale === "nl" ? "Opdracht" : "Assignment"
            } N', or write a standalone question.`,
          });
        }
        assignment = undefined;
      }
      const parsedQuestion = startQuestion(
        index + 1,
        nested && assignment ? label : undefined,
        points,
        nested && assignment || !detail[1].match(/^\d+/)
          ? undefined
          : Number(detail[1].match(/^\d+/)![0]),
      );
      if (detail[3]) parsedQuestion.text = detail[3].trim();
      // Free text after the number is a name for the question, as in '## Vraag 12 (optioneel)'.
      if (detail[4]) parsedQuestion.title = detail[4].trim();
      continue;
    }
    if (assignment && !question) {
      assignment.text += `${assignment.text ? "\n" : ""}${raw}`;
      continue;
    }
    if (!question || !line) continue;

    const plain = line.replace(/\*\*|__|`/g, "");
    const answer = plain.match(
      /^(?:(?:correct|good|right)\s+answer|(?:correct|goede?|juiste?)\s+antwoord|antwoord|answer)\s*:\s*(.*)$/i,
    );
    if (answer) {
      if (answerSeen) {
        issue(
          "quiz-duplicate-answer",
          index + 1,
          "More than one correct-answer declaration; keep exactly one.",
        );
      }
      answerSeen = true;
      if (checkboxOptionCount) {
        issue(
          "quiz-duplicate-answer",
          index + 1,
          "Use checked options or a correct-answer declaration, not both.",
        );
      }
      const answerText = answer[1].trim();
      const labels = parseCorrectAnswers(answerText);
      if (
        !question.options.length && question.label &&
        !looksLikeAnswerKey(answerText)
      ) {
        const shortAnswer = answer[1].match(/^(.*?)\s+~(\d+)\s*$/);
        const accepted = splitQuizDownAnswers(
          shortAnswer ? shortAnswer[1] : answer[1],
        );
        if (accepted.length) {
          question.responseType = "open_short";
          question.acceptedAnswers = accepted;
          if (shortAnswer) question.maxLength = Number(shortAnswer[2]);
        } else {
          issue("quiz-answer-syntax", index + 1, "Specify an answer.");
        }
      } else if (!labels) {
        const shortAnswer = answer[1].match(/^(.*?)\s+~(\d+)\s*$/);
        const accepted = splitQuizDownAnswers(
          shortAnswer ? shortAnswer[1] : answer[1],
        );
        if (!question.options.length && accepted.length) {
          question.responseType = "open_short";
          question.acceptedAnswers = accepted;
          if (shortAnswer) question.maxLength = Number(shortAnswer[2]);
        } else {
          issue(
            "quiz-answer-syntax",
            index + 1,
            "Specify answer letters, for example 'Correct answer: A' or 'Correct answer: A, C', or provide accepted short answers.",
          );
        }
      } else {
        question.correctAnswer = labels[0];
        if (labels.length > 1) {
          question.correctAnswers = labels;
          question.responseType = "multiple";
        }
      }
      continue;
    }
    const checkboxOption = line.match(
      /^(?:[-+*]\s+)?\[([ xX])\]\s+(?:([a-z])[.)]\s+)?(.*)$/i,
    );
    if (checkboxOption) {
      if (regularOptionCount) {
        // Report the mix once and skip the line, so the question keeps its
        // lettered options and does not also get follow-up answer errors.
        issue(
          "quiz-option-syntax",
          index + 1,
          "Do not mix checkbox options with lettered answer options.",
        );
        continue;
      }
      if (answerSeen) {
        issue(
          "quiz-duplicate-answer",
          index + 1,
          "Use checked options or a correct-answer declaration, not both.",
        );
      }
      checkboxOptionCount++;
      question.responseType = "multiple";
      const label = (checkboxOption[2] ??
        String.fromCharCode(64 + question.options.length + 1))
        .toUpperCase();
      question.options.push({
        label,
        text: checkboxOption[3].trim(),
      });
      question.correctAnswers ??= [];
      if (checkboxOption[1].toLowerCase() === "x") {
        question.correctAnswers.push(label);
        question.correctAnswer = question.correctAnswers[0];
      }
      continue;
    }
    const option = line.match(
      /^(?:[-+*]\s+)?(?:\*\*|__|`)?([a-z])(?:\*\*|__|`)?[.)](?:\*\*|__|`)?(?:\s+(.*))?$/i,
    );
    if (option) {
      if (checkboxOptionCount) {
        issue(
          "quiz-option-syntax",
          index + 1,
          "Do not mix checkbox options with lettered answer options.",
        );
        continue;
      }
      regularOptionCount++;
      question.options.push({
        label: option[1].toUpperCase(),
        text: (option[2] ?? "").trim(),
      });
      continue;
    }
    if (
      /^(?:[-+*]\s+)?(?:\*\*|__|`)?[a-z][.)]/i.test(line) ||
      /^[-+*]\s+\[[ xX]\]/.test(line)
    ) {
      issue(
        "quiz-option-syntax",
        index + 1,
        "Unrecognized option; use '- A. Answer text' or '**a)** Answer text'.",
      );
    } else if (!question.options.length && !answerSeen) {
      question.text += `${question.text ? " " : ""}${line}`;
    }
  }
  return quiz;
}

/** True when the Markdown holds a fenced `quiz` block, the QuizDown syntax. */
export function isQuizDown(content: string): boolean {
  return extractQuizDownBlock(content) !== null ||
    hasQuizDownHeadings(content);
}

/** Marks a line that ends the current assignment before it is read. */
const END_ASSIGNMENT = "\u0000";

/** Replaces the heading line of a question's explanation section. */
const EXPLANATION = "\u0001";

/** The fixed heading names of an explanation section, directly under a question. */
const explanationHeading = /^(?:Toelichting|Explanation)$/;

const quizDownHeading = /^(#{1,6})\s+(.*?)\s*$/;

/** Visit the lines outside fenced code, with their one-based line numbers. */
function outsideFences(
  content: string,
  visit: (raw: string, line: number) => void,
): void {
  let fence: { character: string; length: number } | undefined;
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const opening = raw.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (opening) {
      if (!fence) {
        fence = { character: opening[1][0], length: opening[1].length };
      } else if (
        opening[1][0] === fence.character &&
        opening[1].length >= fence.length && !opening[2].trim()
      ) {
        fence = undefined;
      }
      continue;
    }
    if (!fence) visit(raw, index + 1);
  }
}

/** True when a heading outside code starts with `?` or `@`: QuizDown heading form. */
export function hasQuizDownHeadings(content: string): boolean {
  let found = false;
  outsideFences(content, (raw) => {
    const heading = raw.match(quizDownHeading);
    if (heading && heading[1].length >= 2 && /^[?@](?:\s|$)/.test(heading[2])) {
      found = true;
    }
  });
  return found;
}

/**
 * Rewrites QuizDown heading form (`## ? Question`, `## @ Assignment`) to the
 * marker form, one output line per input line, so line numbers stay exact.
 *
 * - `## @ Title` and `## ? Title` become `@ Title` and `? Title`.
 * - A heading of the same or a higher level ends the question, and an
 *   assignment ends at a heading of its own or a higher level; a plain heading
 *   becomes a section break (a lone END_ASSIGNMENT line).
 * - Headings inside a question are reported, not guessed.
 */
function quizDownFromHeadings(
  content: string,
): { source: string; issues: QuizIssue[] } {
  const issues: QuizIssue[] = [];
  const lines = content.split(/\r?\n/);
  const output = [...lines];
  let assignmentLevel: number | undefined;
  let questionLevel: number | undefined;
  let explanationLevel: number | undefined;
  outsideFences(content, (raw, line) => {
    const heading = raw.match(quizDownHeading);
    if (!heading) return;
    const level = heading[1].length;
    const text = heading[2];
    if (explanationLevel !== undefined && level > explanationLevel) {
      return; // A heading inside an explanation stays Markdown.
    }
    if (
      questionLevel !== undefined && level === questionLevel + 1 &&
      explanationHeading.test(text)
    ) {
      if (explanationLevel !== undefined) {
        issues.push({
          rule: "quizdown-duplicate-explanation",
          line,
          message: "A question has at most one explanation section.",
          severity: "error",
        });
      }
      explanationLevel = level;
      output[line - 1] = EXPLANATION;
      return;
    }
    explanationLevel = undefined;
    const marker = text.match(/^([?@])(?:\s+(.*))?$/);
    if (level === 1) {
      output[line - 1] = END_ASSIGNMENT;
      assignmentLevel = questionLevel = undefined;
      return;
    }
    if (marker?.[1] === "@") {
      if (!marker[2]) {
        issues.push({
          rule: "quizdown-heading-title",
          line,
          message: "An assignment heading needs a title: '## @ Title'.",
          severity: "error",
        });
      }
      output[line - 1] = `@ ${marker[2] ?? "(untitled)"}`;
      assignmentLevel = level;
      questionLevel = undefined;
      return;
    }
    if (marker?.[1] === "?") {
      if (!marker[2]) {
        issues.push({
          rule: "quizdown-heading-title",
          line,
          message: "A question heading needs a title: '## ? Title'.",
          severity: "error",
        });
      }
      let prefix = "";
      if (assignmentLevel !== undefined && level <= assignmentLevel) {
        prefix = END_ASSIGNMENT;
        assignmentLevel = undefined;
      }
      if (questionLevel !== undefined && level > questionLevel) {
        issues.push({
          rule: "quizdown-nested-question",
          line,
          message:
            "A question cannot contain a question. Use '## @ Title' for an assignment with sub-questions.",
          severity: "error",
        });
      }
      questionLevel = level;
      output[line - 1] = `${prefix}? ${marker[2] ?? "(untitled)"}`;
      return;
    }
    if (questionLevel !== undefined && level > questionLevel) {
      issues.push({
        rule: "quizdown-invalid-subheading-in-question",
        line,
        message:
          "A heading inside a question is only supported for its explanation: name it 'Toelichting' or 'Explanation', one level below the question. Otherwise end the question with a heading of the same or a higher level.",
        severity: "error",
      });
      output[line - 1] = "";
      return;
    }
    if (
      assignmentLevel !== undefined && questionLevel === undefined &&
      level > assignmentLevel
    ) {
      return; // A heading inside the shared context stays Markdown.
    }
    output[line - 1] = END_ASSIGNMENT; // A section break.
    assignmentLevel = questionLevel = undefined;
  });
  return { source: output.join("\n"), issues };
}

function extractQuizDownBlock(
  content: string,
): { body: string; startLine: number } | null {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const opening = lines[index].match(/^\s*(`{3,}|~{3,})\s*(\S+)(.*)$/);
    if (!opening) continue;
    const fence = opening[1];
    const openingLine = index;
    let nestedFenceLength = 0;
    let nestedFenceCharacter = "";
    const body: string[] = [];
    for (index++; index < lines.length; index++) {
      // An info string may not start with a fence character, otherwise a
      // closing fence of four or more backticks would count as an opening.
      const nestedOpening = lines[index].match(
        /^\s*(`{3,}|~{3,})\s*[^`~\s].*$/,
      );
      if (nestedOpening) {
        nestedFenceLength = nestedOpening[1].length;
        nestedFenceCharacter = nestedOpening[1][0];
        body.push(lines[index]);
        continue;
      }
      const closing = lines[index].match(/^\s*(`+|~+)\s*$/);
      if (
        closing && nestedFenceLength &&
        closing[1][0] === nestedFenceCharacter &&
        closing[1].length >= nestedFenceLength
      ) {
        nestedFenceLength = 0;
        nestedFenceCharacter = "";
        body.push(lines[index]);
        continue;
      }
      if (
        closing && closing[1][0] === fence[0] &&
        !nestedFenceLength &&
        closing[1].length >= fence.length
      ) {
        if (/^(?:quiz|quizz)$/i.test(opening[2])) {
          return { body: body.join("\n"), startLine: openingLine + 2 };
        }
        break;
      }
      body.push(lines[index]);
    }
    if (index === lines.length) return null;
  }
  return null;
}

function parseQuizDown(source: string, markdown: string): ParsedQuiz {
  const title = markdown.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1] ?? "";
  const quiz: ParsedQuiz = { title, questions: [], blocks: [], issues: [] };
  let question: QuizQuestion | undefined;
  let assignment: QuizAssignment | undefined;
  let assignmentCount = 0;
  let currentOption: { text: string; forcedOrder?: number } | undefined;
  let questionHasRoundMarkers = false;
  let questionHasSquareMarkers = false;
  const issue = (rule: string, line: number, message: string) => {
    quiz.issues!.push({
      rule,
      line,
      question: question?.number,
      message,
    });
  };

  const finalizeQuestion = (line: number) => {
    if (!question) return;
    if (question.explanation !== undefined) {
      question.explanation = question.explanation.trim();
      if (!question.explanation) {
        issue(
          "quizdown-explanation-empty",
          explanationLine || line,
          "The explanation section is empty; remove the heading or add the text.",
        );
      }
    }
    if (questionHasRoundMarkers && questionHasSquareMarkers) {
      issue(
        "quiz-option-syntax",
        line,
        "Do not mix '( )' and '[ ]' option markers in one question.",
      );
    }
    if (question.options.length) {
      if (question.acceptedAnswers!.length) {
        issue(
          "quiz-answer",
          line,
          "A question cannot mix choice options and open short-answer syntax.",
        );
      }
      question.responseType = questionHasSquareMarkers ? "multiple" : "single";
      if (
        question.responseType === "single" &&
        question.correctAnswers!.length > 1
      ) {
        issue(
          "quiz-answer",
          line,
          "A single-choice question must have exactly one correct option.",
        );
      } else if (
        question.responseType === "single" &&
        question.correctAnswers!.length === 0
      ) {
        question.correctAnswers = [question.options[0].label];
        question.correctAnswer = question.options[0].label;
      }
      if (
        question.responseType === "multiple" &&
        question.correctAnswers!.length === 0
      ) {
        issue(
          "quiz-answer",
          line,
          "Mark at least one correct option with '[x]' for a multiple-response question.",
        );
      }
      question.options = orderQuizDownOptions(question.options);
    } else if (question.acceptedAnswers?.length) {
      question.responseType = "open_short";
    } else {
      issue(
        "quiz-answer",
        line,
        "Question has no answer options or accepted short-answer values.",
      );
    }
  };

  // Fenced code inside a prompt or an option is kept verbatim: indentation and
  // blank lines matter in code, and QuizDown markers inside it are not syntax.
  let codeFence: string | null = null;
  let optionIndent = 0;
  let blankAfterOption = false;
  const stripIndent = (line: string, indent: number) =>
    line.replace(new RegExp(`^ {0,${indent}}`), "");
  const appendText = (line: string) => {
    if (inExplanation && question) {
      question.explanation = `${
        question.explanation ? question.explanation + "\n" : ""
      }${line}`;
    } else if (!question && assignment) {
      assignment.text += `${assignment.text ? "\n" : ""}${line}`;
    } else if (currentOption) {
      const lastOption = question!.options.at(-1)!;
      const text = stripIndent(line, optionIndent);
      lastOption.text += `${lastOption.text ? "\n" : ""}${text}`;
    } else {
      question!.text += `${question!.text ? "\n" : ""}${line}`;
    }
  };
  const fenceOpening = (line: string) =>
    line.trim().match(/^(`{3,}|~{3,})\s*(?:[^`~\s].*)?$/)?.[1] ?? null;

  let ignoreText = false;
  let inExplanation = false;
  let explanationLine = 0;
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    let raw = line;
    if (raw.startsWith(END_ASSIGNMENT) && codeFence === null) {
      // From heading form: this line ends the current assignment first.
      finalizeQuestion(index + 1);
      question = undefined;
      assignment = undefined;
      currentOption = undefined;
      inExplanation = false;
      raw = raw.slice(1);
      if (!raw.trim()) {
        ignoreText = true; // A section break: text up to the next marker is not part of a quiz.
        continue;
      }
    }
    if (raw === EXPLANATION && codeFence === null) {
      if (question) {
        question.explanation = "";
        explanationLine = index + 1;
        inExplanation = true;
      }
      continue;
    }
    const trimmed = raw.trim();
    if (
      inExplanation && codeFence === null && !/^[?@]\s/.test(trimmed)
    ) {
      codeFence = fenceOpening(raw);
      appendText(raw);
      continue;
    }
    if (codeFence !== null) {
      appendText(raw);
      const closing = trimmed.match(/^(`+|~+)$/)?.[1];
      if (
        closing && closing[0] === codeFence[0] &&
        closing.length >= codeFence.length
      ) {
        codeFence = null;
      }
      continue;
    }
    if (!trimmed) {
      // As in GFM, indented content after a blank line still belongs to the
      // option; only a line that is not indented ends it.
      blankAfterOption = currentOption !== undefined;
      continue;
    }
    const continuesOption = blankAfterOption && /^\s+/.test(raw);
    if (continuesOption) appendText("");
    if (!continuesOption && blankAfterOption) currentOption = undefined;
    blankAfterOption = false;
    if (/^[?@]\s/.test(trimmed)) {
      ignoreText = false;
      inExplanation = false;
    }
    const assignmentStart = trimmed.match(/^@\s+(.+)$/);
    if (assignmentStart) {
      finalizeQuestion(index + 1);
      question = undefined;
      currentOption = undefined;
      assignment = {
        number: ++assignmentCount,
        title: assignmentStart[1].trim(),
        text: "",
        questions: [],
        line: index + 1,
      };
      quiz.blocks!.push({ type: "assignment", assignment });
      continue;
    }
    const prompt = trimmed.match(/^\?\s+(.+)$/);
    if (prompt) {
      finalizeQuestion(index + 1);
      const { text, points, invalidPoints } = splitQuizDownPoints(prompt[1]);
      if (invalidPoints) {
        quiz.issues!.push({
          rule: "quiz-points-syntax",
          line: index + 1,
          message:
            `Write points as '(2 pt)' or '(2)' at the end of the '?' line, not '${invalidPoints}'.`,
        });
      }
      question = {
        number: quiz.questions.length + 1,
        text,
        title: text,
        options: [],
        correctAnswer: "",
        correctAnswers: [],
        acceptedAnswers: [],
        line: index + 1,
        ...(points === undefined ? {} : { points }),
      };
      quiz.questions.push(question);
      if (assignment) {
        question.label = `${assignment.number}${
          String.fromCharCode(97 + assignment.questions.length)
        }`;
        assignment.questions.push(question);
      } else {
        quiz.blocks!.push({ type: "question", question });
      }
      questionHasRoundMarkers = false;
      questionHasSquareMarkers = false;
      currentOption = undefined;
      continue;
    }
    if (!question && assignment) {
      // Shared context: only '?' and '@' are markers here, so a list such as
      // '- [ ] item' or a line starting with '!' stays Markdown text.
      codeFence = fenceOpening(raw);
      appendText(raw);
      continue;
    }
    if (!question && ignoreText) continue;
    if (!question) {
      issue(
        "quiz-question",
        index + 1,
        "QuizDown content must start with a question using '? prompt' or an assignment using '@ title'.",
      );
      continue;
    }
    const hint = trimmed.match(/^!\s+(.+)$/);
    if (hint) {
      question.hint = hint[1].trim();
      currentOption = undefined;
      continue;
    }
    const openAnswer = trimmed.match(/^=\s+(.+)$/);
    if (openAnswer) {
      const value = openAnswer[1];
      const maxLengthMatch = value.match(/\s+~(\d+)\s*$/);
      const accepted = maxLengthMatch
        ? value.slice(0, maxLengthMatch.index).trim()
        : value.trim();
      question.acceptedAnswers = splitQuizDownAnswers(accepted);
      if (maxLengthMatch) {
        question.maxLength = Number(maxLengthMatch[1]);
      }
      currentOption = undefined;
      continue;
    }
    const option = raw.match(
      /^\s*-\s*(?:(\d+)\.\s*)?(\([ xX]\)|\[[ xX]\])\s*(.*)$/,
    );
    if (option) {
      let forcedOrder = option[1] ? Number(option[1]) : undefined;
      let text = option[3] ?? "";
      if (forcedOrder === undefined) {
        const afterMarker = text.match(/^(\d+)\.\s+(.*)$/);
        if (afterMarker) {
          forcedOrder = Number(afterMarker[1]);
          text = afterMarker[2];
        }
      }
      const isCorrect = /x/i.test(option[2]);
      const label = String.fromCharCode(65 + question.options.length);
      // An optional visible label ('a.' or 'b)') must match the option's position.
      const written = text.match(/^([a-z])[.)]\s+(.*)$/i);
      if (written) {
        if (written[1].toUpperCase() === label) {
          text = written[2];
        } else {
          issue(
            "quizdown-option-label",
            index + 1,
            `Option label '${
              written[1]
            }.' does not match its position; labels are optional, but if used they run a., b., c. in order (expected '${label.toLowerCase()}.').`,
          );
        }
      }
      question.options.push({
        label,
        text: text.trim(),
      });
      if (isCorrect) {
        question.correctAnswers!.push(label);
        question.correctAnswer ||= label;
      }
      if (forcedOrder !== undefined) {
        question.options.at(-1)!.forcedOrder = forcedOrder;
      }
      if (option[2].startsWith("[")) questionHasSquareMarkers = true;
      else questionHasRoundMarkers = true;
      currentOption = {
        text: "",
        forcedOrder,
      };
      // Continuation lines are indented under the option text.
      optionIndent = (raw.match(/^\s*/)?.[0].length ?? 0) + 2;
      continue;
    }
    if (/^\s+/.test(raw) && currentOption) {
      codeFence = fenceOpening(raw);
      appendText(raw);
      continue;
    }
    if (question.options.length) {
      issue(
        "quizdown-unindented-option-content",
        index + 1,
        "Text or a fenced block after the options must be indented under its option (two spaces); it is not part of the option.",
      );
    }
    currentOption = undefined;
    codeFence = fenceOpening(raw);
    appendText(codeFence === null ? trimmed : raw);
  }
  finalizeQuestion(lines.length);
  return quiz;
}

/**
 * Splits trailing points off a QuizDown prompt. Only '(2 pt)' and '(2)' are
 * points; a spelling such as '(2 punten)' is reported, not silently kept.
 */
function splitQuizDownPoints(
  value: string,
): { text: string; points?: number; invalidPoints?: string } {
  const valid = value.match(/^(.*?)\s*\((\d+)(?:\s*pt)?\)\s*$/);
  if (valid) return { text: valid[1].trim(), points: Number(valid[2]) };
  const invalid = value.match(/\(\s*\d+(?:[.,]\d+)?\s*[a-z.]+\s*\)\s*$/i);
  const looksLikePoints = invalid &&
    /^\(\s*\d+(?:[.,]\d+)?\s*(?:pts?|punt(?:en)?|points?|p)\.?\s*\)$/i
      .test(invalid[0].trim());
  return {
    text: value.trim(),
    ...(looksLikePoints ? { invalidPoints: invalid![0].trim() } : {}),
  };
}

function splitQuizDownAnswers(value: string): string[] {
  const escapedSlash = "\u0000";
  return value.replace(/\\\//g, escapedSlash)
    .split(/\s+\/\s+/)
    .map((answer) => answer.replaceAll(escapedSlash, "/").trim())
    .filter(Boolean);
}

function orderQuizDownOptions(
  options: QuizQuestion["options"],
): QuizQuestion["options"] {
  if (!options.some((option) => option.forcedOrder !== undefined)) {
    return options;
  }
  const slots: (QuizQuestion["options"][number] | undefined)[] = Array(
    options.length,
  ).fill(undefined);
  const unordered: QuizQuestion["options"][number][] = [];
  for (const option of options) {
    if (option.forcedOrder === undefined) {
      unordered.push(option);
      continue;
    }
    let index = Math.max(
      0,
      Math.min(options.length - 1, option.forcedOrder - 1),
    );
    while (index < slots.length && slots[index]) index++;
    if (index >= slots.length) {
      index = slots.lastIndexOf(undefined);
    }
    slots[index] = option;
  }
  let unorderedIndex = 0;
  return slots.map((option) => option ?? unordered[unorderedIndex++]);
}

function parseCorrectAnswers(value: string): string[] | null {
  const answer = value.trim();
  const single = answer.match(/^([a-z])[.)]?$/i);
  if (single) return [single[1].toUpperCase()];
  let labels: string[];
  if (/^[a-z]{2,}$/i.test(answer)) {
    labels = [...answer.toUpperCase()];
  } else {
    const separated = answer.replace(/\b(?:and|en)\b/gi, ",");
    if (!/^[a-z](?:(?:\s*[,;&]\s*|\s+)[a-z])*$/i.test(separated)) {
      return null;
    }
    labels = separated.match(/[a-z]/gi)!.map((label) => label.toUpperCase());
  }
  return new Set(labels).size === labels.length ? labels : null;
}

function looksLikeAnswerKey(value: string): boolean {
  return /^[a-z]$/i.test(value) || /^[A-Z]{2,}$/.test(value) ||
    /^[a-z](?:\s+[a-z])+$/i.test(value) ||
    /[,;&]|\b(?:and|en)\b/i.test(value);
}

/** Check that each exported question has one reachable, unambiguous scoring key. */
export function validateQuiz(
  quiz: ParsedQuiz,
  options: QuizValidationOptions = {},
): QuizIssue[] {
  const issues = [...(quiz.issues ?? [])];
  if (!quiz.questions.length) {
    issues.push({
      rule: "quiz-no-questions",
      line: 1,
      message: "No questions found. Use '## Question N' or '## Vraag N'.",
    });
  }
  const seen = new Set<number>();
  for (const block of quiz.blocks ?? []) {
    if (block.type !== "assignment") continue;
    if (!block.assignment.questions.length) {
      issues.push({
        rule: "quiz-assignment-empty",
        line: block.assignment.line ?? 1,
        message: `Opdracht ${block.assignment.number} has no deelvragen.`,
      });
      continue;
    }
    for (
      const [index, part] of block.assignment.questions.entries()
    ) {
      const letter = part.label?.at(-1)?.toLowerCase();
      if (!letter || letter.charCodeAt(0) !== "a".charCodeAt(0) + index) {
        issues.push({
          rule: "quiz-subquestion-order",
          line: part.line ?? block.assignment.line ?? 1,
          question: part.number,
          message: `${options.questionPrefix ?? "Subquestion"}s in ${
            options.assignmentPrefix ?? "Assignment"
          } ${block.assignment.number} must use consecutive letters starting with a.`,
        });
      }
    }
  }
  for (const question of quiz.questions) {
    const issue = (rule: string, message: string) =>
      issues.push({
        rule,
        message,
        question: question.number,
        line: question.line ?? 1,
      });
    if (
      !Number.isSafeInteger(question.number) || question.number < 1 ||
      seen.has(question.number)
    ) {
      issue(
        "quiz-question-number",
        "Question numbers must be unique positive integers.",
      );
    }
    seen.add(question.number);
    if (!question.text.trim()) {
      issue("quiz-prompt", "The question prompt is empty.");
    }
    if (
      question.points !== undefined &&
      (!Number.isFinite(question.points) || question.points <= 0)
    ) {
      issue("quiz-points", "Question points must be a positive number.");
    }
    const labels = question.options.map((option) => option.label);
    if (question.responseType === "open_short") {
      if (question.options.length) {
        issue(
          "quiz-answer",
          "An open short-answer question cannot also have answer options.",
        );
      }
      if (!question.acceptedAnswers?.length) {
        issue(
          "quiz-answer",
          "An open short-answer question needs at least one accepted answer.",
        );
      }
      if (
        question.maxLength !== undefined &&
        (!Number.isSafeInteger(question.maxLength) || question.maxLength < 1)
      ) {
        issue(
          "quiz-answer",
          "The short-answer maximum length must be positive.",
        );
      }
      continue;
    }
    if (labels.length < 2) {
      issue("quiz-options", "At least two answer options are required.");
    }
    if (
      new Set(labels).size !== labels.length ||
      labels.some((label) => !/^[A-Z]$/.test(label))
    ) {
      issue(
        "quiz-option-label",
        "Answer labels must be unique uppercase letters.",
      );
    }
    if (question.options.some((option) => !option.text.trim())) {
      issue("quiz-option-text", "Answer option text cannot be empty.");
    }
    // A malformed key already has a precise diagnostic at its declaration.
    const malformedAnswer = issues.some((issue) =>
      issue.rule === "quiz-answer-syntax" && issue.question === question.number
    );
    const correctAnswers = question.correctAnswers ?? [question.correctAnswer];
    if (!malformedAnswer && !correctAnswers[0]) {
      issue(
        "quiz-answer",
        "The correct answer is missing. Use 'Correct answer: A' or mark at least one option with '[x]'.",
      );
    } else if (
      !malformedAnswer &&
      correctAnswers.some((answer) => !labels.includes(answer))
    ) {
      issue(
        "quiz-answer",
        "A correct answer does not match an option. Use an existing option letter.",
      );
    }
    if (
      correctAnswers.length > 1 &&
      new Set(correctAnswers).size !== correctAnswers.length
    ) {
      issue("quiz-answer", "Correct answer labels must not be repeated.");
    }
  }
  return issues;
}

/** Fail before producing invalid QTI or an ungradable quiz preview. */
export function assertValidQuiz(
  quiz: ParsedQuiz,
  sourceFile = "Quiz",
  options: QuizValidationOptions = {},
): void {
  const issues = validateQuiz(quiz, options).filter((issue) =>
    issue.severity !== "warning"
  );
  if (!issues.length) return;
  const message = issues.map((issue) =>
    `${sourceFile}:${issue.line}: ${
      issue.question !== undefined ? `Question ${issue.question}: ` : ""
    }${issue.message} [${issue.rule}]`
  ).join("\n");
  throw Object.assign(new Error(message), { exitCode: 3 });
}
