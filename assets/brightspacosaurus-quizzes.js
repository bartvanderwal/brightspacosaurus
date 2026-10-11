// @ts-self-types="./brightspacosaurus-quizzes.d.ts"
/** Stable option identities survive Fisher-Yates shuffling of their DOM nodes. */
function shuffleOptions(options, random) {
  const shuffled = Array.from(options);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

/** Initialize practice quizzes once per page, also after Docusaurus navigation. */
function initializeQuizzes(root, random = Math.random) {
  root.querySelectorAll(".bso-quiz").forEach(function (quiz) {
    if (quiz.dataset.bsoQuizReady) return;
    quiz.dataset.bsoQuizReady = "true";
    const questions = Array.from(quiz.querySelectorAll(".bso-quiz-question"));
    const sourceOptions = questions.map((question) =>
      questionIsOpenShort(question)
        ? []
        : Array.from(question.querySelector(".bso-quiz-options").children)
    );
    const feedback = document.createElement("p");
    feedback.className = "bso-quiz-feedback";
    feedback.setAttribute("role", "status");
    const check = document.createElement("button");
    check.type = "button";
    check.textContent = "Check answers";
    const restart = document.createElement("button");
    restart.type = "button";
    restart.textContent = "New attempt";
    function beginAttempt() {
      questions.forEach(function (question, index) {
        const list = question.querySelector(".bso-quiz-options");
        const options = quiz.dataset.shuffleAnswers === "true"
          ? shuffleOptions(sourceOptions[index], random)
          : sourceOptions[index];
        options.forEach((option) => list.appendChild(option));
        question.querySelectorAll("input").forEach((input) => {
          if (input.type === "text") input.value = "";
          else input.checked = false;
        });
        const answer = question.querySelector(".bso-quiz-answer");
        answer.hidden = true;
        answer.open = false;
      });
      feedback.textContent = "";
    }
    check.addEventListener("click", function () {
      const selected = questions.map((question) =>
        question.dataset.responseType === "open_short"
          ? [question.querySelector(".bso-quiz-open-answer").value]
          : Array.from(
            question.querySelectorAll("input:checked"),
            (input) => input.value,
          )
      );
      if (
        selected.some((answers, index) =>
          questionIsOpenShort(questions[index])
            ? !answers[0].trim()
            : !answers.length
        )
      ) {
        feedback.textContent = "Choose an answer for every question.";
        return;
      }
      const correctAnswers = questions.map((question, index) =>
        questionIsOpenShort(question)
          ? JSON.parse(question.dataset.correctAnswers ?? "[]").some(
            (answer) =>
              normalizeShortAnswer(answer) ===
                normalizeShortAnswer(selected[index][0]),
          )
          : JSON.stringify([...selected[index]].sort()) ===
            JSON.stringify(
              JSON.parse(
                question.dataset.correctAnswers ??
                  JSON.stringify([question.dataset.correctAnswer]),
              ).sort(),
            )
      );
      if (questions.some((question) => question.dataset.points !== undefined)) {
        const points = questions.map((question) =>
          Number(question.dataset.points ?? 1)
        );
        const score = correctAnswers.reduce(
          (sum, correct, index) => sum + (correct ? points[index] : 0),
          0,
        );
        const totalPoints = points.reduce((sum, value) => sum + value, 0);
        feedback.textContent = `${Number(score.toPrecision(12))} / ${
          Number(totalPoints.toPrecision(12))
        } points`;
      } else {
        const correct = correctAnswers.filter(Boolean).length;
        feedback.textContent = `${correct} / ${questions.length} correct`;
      }
      questions.forEach((question) => {
        question.querySelector(".bso-quiz-answer").hidden = false;
      });
    });
    restart.addEventListener("click", function () {
      beginAttempt();
      questions[0].querySelector("input").focus();
    });
    quiz.append(check, restart, feedback);
    beginAttempt();
  });
}

function questionIsOpenShort(question) {
  return question.dataset.responseType === "open_short";
}

function normalizeShortAnswer(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Also a global, so a bundler (Docusaurus) can import this file as a side-effect
// module and call globalThis.bsoQuizzes.initialize...(document), like the tabs script.
if (typeof globalThis !== "undefined") {
  globalThis.bsoQuizzes = { initializeQuizzes, shuffleOptions };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initializeQuizzes, shuffleOptions };
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    initializeQuizzes(document);
  });
}
