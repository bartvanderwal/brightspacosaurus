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
    const questions = quiz.questions.map((question) =>
      element("fieldset", {
        className: "bso-quiz-question",
        "data-correct-answer": question.correctAnswer,
      }, [
        element("legend", {}, [text(`Question ${question.number}`)]),
        element("p", {}, [text(question.text)]),
        element(
          "ol",
          { className: "bso-quiz-options", type: "A" },
          question.options.map((option) =>
            element("li", {}, [
              element("label", {}, [
                element("input", {
                  type: "radio",
                  name: `bso-question-${question.number}`,
                  value: option.label,
                }),
                text(` ${option.text}`),
              ]),
            ])
          ),
        ),
        element("details", { className: "bso-quiz-answer" }, [
          element("summary", {}, [text("Show correct answer")]),
          element("p", {}, [text(
            question.options.find((option) =>
              option.label === question.correctAnswer
            )!.text,
          )]),
        ]),
      ])
    );
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
