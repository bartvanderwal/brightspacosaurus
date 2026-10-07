/** Docusaurus remark adapter using the same quiz model and settings as QTI export. */
import { assertValidQuiz, parseQuizMarkdown } from "./quiz-parser.ts";
import { resolveQuizOptions } from "./quiz-config.ts";
import type { FlashcardNode } from "./flashcards.ts";
import type { QuizConfig } from "./types.ts";

function text(value: string): FlashcardNode {
  return { type: "text", value };
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
    const quiz = parseQuizMarkdown(String(file.value));
    assertValidQuiz(quiz, file.path);
    const questions = quiz.questions.map((question) => {
      const responseType = question.responseType ?? "single";
      const correctAnswers = responseType === "open_short"
        ? question.acceptedAnswers ?? []
        : question.correctAnswers ?? [question.correctAnswer];
      const properties = {
        className: "bso-quiz-question",
        "data-correct-answer": question.correctAnswer,
        "data-correct-answers": JSON.stringify(correctAnswers),
        "data-response-type": responseType,
      };
      const children = [
        element("legend", {}, [text(`Question ${question.number}`)]),
        element("p", {}, [text(question.text)]),
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
                  text(` ${option.text}`),
                ]),
              ])
            ),
          ),
        );
      }
      children.push(element("details", { className: "bso-quiz-answer" }, [
        element("summary", {}, [text("Show correct answer")]),
        element("p", {}, [
          text(
            responseType === "open_short"
              ? correctAnswers[0] ?? ""
              : correctAnswers.map((answer) =>
                question.options.find((option) => option.label === answer)!.text
              ).join(", "),
          ),
        ]),
      ]));
      if (question.hint) {
        children.push(element("details", { className: "bso-quiz-hint" }, [
          element("summary", {}, [text("Show hint")]),
          element("p", {}, [text(question.hint)]),
        ]));
      }
      return element("fieldset", properties, children);
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
      }, questions),
    ];
  };
}
