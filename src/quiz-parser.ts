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
}

/** A parsed multiple-choice question. */
export interface QuizQuestion {
  /** Author-supplied question number; used in stable QTI identifiers. */
  number: number;
  /** Student-facing prompt. */
  text: string;
  /** Stable labels and their corresponding answer texts. */
  options: { label: string; text: string }[];
  /** Uppercase first correct label, retained for single-answer consumers. */
  correctAnswer: string;
  /** All correct labels for multiple-response questions. */
  correctAnswers?: string[];
  /** Checkbox-marked options represent a multiple-response question. */
  responseType?: "multiple";
  /** One-based heading line, if parsed from Markdown. */
  line?: number;
}

/** Quiz model shared by lint, QTI export and Docusaurus preview. */
export interface ParsedQuiz {
  /** Student-facing quiz title. */
  title: string;
  /** Questions in author order. */
  questions: QuizQuestion[];
  /** Syntax errors found while parsing; export must reject these. */
  issues?: QuizIssue[];
}

/** Parse documented English/Dutch labels independently of bold or code formatting. */
export function parseQuizMarkdown(content: string): ParsedQuiz {
  const quiz: ParsedQuiz = { title: "", questions: [], issues: [] };
  let question: QuizQuestion | undefined;
  let answerSeen = false;
  let checkboxOptionCount = 0;
  let regularOptionCount = 0;
  let fence: { character: string; length: number } | undefined;
  const issue = (rule: string, line: number, message: string) => {
    quiz.issues!.push({ rule, line, question: question?.number, message });
  };

  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      if (!fence) {
        fence = { character: fenceMatch[1][0], length: fenceMatch[1].length };
      } else if (
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()
      ) fence = undefined;
      continue;
    }
    if (fence) {
      // A fenced example must never supply an answer key or question heading.
      if (question && !question.options.length) {
        question.text += `${question.text ? "\n" : ""}${raw}`;
      }
      continue;
    }
    if (line.startsWith("# ")) {
      if (!quiz.title) quiz.title = line.slice(2).trim();
      continue;
    }
    const heading = line.match(/^##\s+(?:Question|Vraag)\s+(\d+)\b/i);
    if (heading) {
      question = {
        number: Number(heading[1]),
        text: "",
        options: [],
        correctAnswer: "",
        line: index + 1,
      };
      quiz.questions.push(question);
      answerSeen = false;
      checkboxOptionCount = 0;
      regularOptionCount = 0;
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
      const labels = parseCorrectAnswers(answer[1]);
      if (!labels) {
        issue(
          "quiz-answer-syntax",
          index + 1,
          "Specify one or more answer letters, for example 'Correct answer: A' or 'Correct answer: A, C'.",
        );
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
        issue(
          "quiz-option-syntax",
          index + 1,
          "Do not mix checkbox options with lettered answer options.",
        );
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

/** Check that each exported question has one reachable, unambiguous scoring key. */
export function validateQuiz(quiz: ParsedQuiz): QuizIssue[] {
  const issues = [...(quiz.issues ?? [])];
  if (!quiz.questions.length) {
    issues.push({
      rule: "quiz-no-questions",
      line: 1,
      message: "No questions found. Use '## Question N' or '## Vraag N'.",
    });
  }
  const seen = new Set<number>();
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
    const labels = question.options.map((option) => option.label);
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
export function assertValidQuiz(quiz: ParsedQuiz, sourceFile = "Quiz"): void {
  const issues = validateQuiz(quiz);
  if (!issues.length) return;
  const message = issues.map((issue) =>
    `${sourceFile}:${issue.line}: ${
      issue.question !== undefined ? `Question ${issue.question}: ` : ""
    }${issue.message} [${issue.rule}]`
  ).join("\n");
  throw Object.assign(new Error(message), { exitCode: 3 });
}
