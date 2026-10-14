/** Docusaurus remark adapter using the same quiz model and settings as QTI export. */
import { assertValidQuiz, parseQuizMarkdown } from "./quiz-parser.ts";
import type { QuizQuestion } from "./quiz-parser.ts";
import { resolveQuizOptions } from "./quiz-config.ts";
import { quizTextNodes } from "./quiz-markdown.ts";
import { questionId, quizDiagramFields, titleDiagramFences } from "./quiz-diagram-fields.ts";
import type { FlashcardNode } from "./flashcards.ts";
import type { QuizConfig } from "./types.ts";

function text(value: string): FlashcardNode {
  return { type: "text", value };
}

/**
 * Question, option and hint text as Markdown nodes from the parser the QTI
 * export also uses (quiz-markdown.ts), so code renders and is highlighted like
 * on lesson pages: a paragraph for prose, a div when the text holds blocks.
 */
function richText(
  tag: "p" | "span",
  value: string,
  properties: Record<string, string> = {},
  diagramTitle?: string,
): FlashcardNode {
  const { nodes, block } = quizTextNodes(value);
  // The same titles as the QTI export, so a diagram has the same alt text in both.
  if (diagramTitle !== undefined) titleDiagramFences(nodes, diagramTitle);
  return element(block ? "div" : tag, properties, nodes as FlashcardNode[]);
}

function element(
  tag: string,
  properties: Record<string, string>,
  children: FlashcardNode[] = [],
): FlashcardNode {
  return {
    type: "bsoQuizElement",
    data: { hName: tag, hProperties: properties },
    children,
  };
}

/** Render quiz-prefixed Markdown as accessible practice questions in the preview. */
export function remarkQuizPreview(
  options: QuizConfig = {},
): (tree: FlashcardNode, file: { path?: string; value: unknown }) => void {
  const config = resolveQuizOptions(options);
  return (tree, file) => {
    if (!/(?:^|[/\\])quiz-[^/\\]+\.md$/i.test(file.path ?? "")) return;
    const quiz = parseQuizMarkdown(String(file.value), config);
    assertValidQuiz(quiz, file.path, config);
    const titles = new Map(
      quizDiagramFields(quiz, config).map((field) => [field.id, field.title]),
    );
    const renderQuestion = (question: QuizQuestion) => {
      const responseType = question.responseType ?? "single";
      const correctAnswers = responseType === "open_short"
        ? question.acceptedAnswers ?? []
        : question.correctAnswers ?? [question.correctAnswer];
      const points = question.points === undefined
        ? ""
        : ` (${question.points} ${
          config.locale === "nl"
            ? question.points === 1 ? "punt" : "punten"
            : question.points === 1
            ? "point"
            : "points"
        })`;
      const label = question.label
        ? `${config.subquestionPrefix} ${question.label}`
        : `${config.questionPrefix} ${question.number}`;
      // "Vraag 2 — Encapsulation": the name, with its inline Markdown, next to
      // the label. A name that is only a number is not shown.
      const legendNodes = (item: QuizQuestion): FlashcardNode[] =>
        item.title && /\p{L}/u.test(item.title)
          ? [
            text(label),
            text(" — "),
            ...(quizTextNodes(item.title).nodes as FlashcardNode[]),
            text(points),
          ]
          : [text(`${label}${points}`)];
      const properties = {
        className: "bso-quiz-question",
        "data-correct-answer": question.correctAnswer,
        "data-correct-answers": JSON.stringify(correctAnswers),
        "data-response-type": responseType,
        ...(question.points === undefined
          ? {}
          : { "data-points": String(question.points) }),
      };
      const children = [
        element("legend", {}, legendNodes(question)),
        richText(
          "p",
          question.text,
          { className: "bso-quiz-prompt" },
          titles.get(`${questionId(question)}.text`),
        ),
      ];
      if (responseType === "open_short") {
        children.push(
          element("input", {
            className: "bso-quiz-open-answer",
            type: "text",
            name: `bso-question-${question.number}`,
            ...(question.maxLength === undefined
              ? {}
              : { maxlength: String(question.maxLength) }),
          }),
        );
      } else {
        children.push(
          element(
            "ol",
            { className: "bso-quiz-options", type: "A" },
            question.options.map((option) =>
              element("li", {}, [
                element("label", {}, [
                  element("input", {
                    type: responseType === "multiple" ? "checkbox" : "radio",
                    name: `bso-question-${question.number}`,
                    value: option.label,
                  }),
                  text(" "),
                  richText("span", option.text, {
                    className: "bso-quiz-option-text",
                  }, titles.get(`${questionId(question)}.option.${option.label}`)),
                ]),
              ])
            ),
          ),
        );
      }
      children.push(element("details", { className: "bso-quiz-answer" }, [
        element("summary", {}, [
          text(
            config.locale === "nl"
              ? "Toon het juiste antwoord"
              : "Show correct answer",
          ),
        ]),
        responseType === "open_short"
          ? element("p", {}, [text(correctAnswers[0] ?? "")])
          : element(
            "div",
            {},
            correctAnswers.map((answer) =>
              // One block per correct answer: answers may hold code blocks,
              // which cannot be joined into one comma-separated line.
              richText(
                "p",
                question.options.find((option) => option.label === answer)!
                  .text,
                {},
                titles.get(`${questionId(question)}.option.${answer}`),
              )
            ),
          ),
      ]));
      if (question.explanation) {
        children.push(
          element("details", { className: "bso-quiz-explanation" }, [
            element("summary", {}, [
              text(config.locale === "nl" ? "Toelichting" : "Explanation"),
            ]),
            richText(
              "p",
              question.explanation,
              {},
              titles.get(`${questionId(question)}.explanation`),
            ),
          ]),
        );
      }
      if (question.hint) {
        children.push(element("details", { className: "bso-quiz-hint" }, [
          element("summary", {}, [
            text(config.locale === "nl" ? "Toon hint" : "Show hint"),
          ]),
          richText(
            "p",
            question.hint,
            {},
            titles.get(`${questionId(question)}.hint`),
          ),
        ]));
      }
      return element("fieldset", properties, children);
    };
    const blocks = quiz.blocks ?? quiz.questions.map((question) => ({
      type: "question" as const,
      question,
    }));
    const content = blocks.map((block) => {
      if (block.type === "question") return renderQuestion(block.question);
      const assignment = block.assignment;
      return element("section", {
        className: "bso-quiz-assignment",
        "data-assignment-number": String(assignment.number),
        "data-points": String(
          assignment.questions.reduce(
            (sum, question) => sum + (question.points ?? 1),
            0,
          ),
        ),
      }, [
        element("h2", {}, [text(assignment.title)]),
        ...(assignment.text.trim()
          ? [
            richText("p", assignment.text, {
              className: "bso-quiz-assignment-context",
            }, titles.get(`a${assignment.number}.text`)),
          ]
          : []),
        ...assignment.questions.map(renderQuestion),
      ]);
    });
    // Run before Docusaurus' defaults so they derive metadata from this tree.
    const title = tree.children?.find((node) =>
      node.type === "heading" && (node as { depth?: number }).depth === 1
    );
    tree.children = [
      ...(title ? [title] : []),
      element("section", {
        className: "bso-quiz",
        "data-shuffle-answers": String(config.shuffleAnswers),
        "data-locale": config.locale,
      }, content),
    ];
  };
}
