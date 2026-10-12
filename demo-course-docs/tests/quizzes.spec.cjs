const { test, expect } = require("@playwright/test");
const quizPath = "/lessons/week-1/quiz-1-fizzbuzz";
const expectedShuffle =
  JSON.parse(process.env.BSO_PREVIEW_QUIZ_CONFIG || '{"shuffleAnswers":true}')
    .shuffleAnswers;

test("sidebar places each quiz directly after its lesson, like the Brightspace menu", async ({ page }) => {
  await page.goto(quizPath);
  const week1 = page.locator(".menu__list-item", {
    hasText: "Week 1: Authoring and links",
  }).last().locator("ul a.menu__link");
  await expect(week1).toHaveText([
    "Lesson 1.1: FizzBuzz",
    "Quiz 1.1: FizzBuzz",
    "Lesson 1.2: Test Pyramid and Test Strategy",
    "Quiz 1.2: Test Strategy",
    "Lesson 1.3: Links, Includes and Export",
    "Quiz 1.3: Links and Includes",
    "Lesson 1.4: Core Concepts Flashcards",
  ]);
  await expect(page.getByRole("button", { name: "partials" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Week 2: Package features", exact: true }),
  ).toBeVisible();
});

test("quiz preview preserves scoring identities when shuffling and keeps order stable within an attempt", async ({ page }) => {
  // A deterministic random source tests the wiring without probabilistic assertions.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(quizPath);
  const quiz = page.locator(".bso-quiz");
  await expect(quiz).toHaveAttribute(
    "data-shuffle-answers",
    String(expectedShuffle),
  );
  await expect(quiz.getByRole("button", { name: "Check answers", exact: true }))
    .toHaveCount(1);
  const questions = quiz.locator(".bso-quiz-question");
  await expect(questions).toHaveCount(3);
  await expect(quiz.locator(".bso-quiz-assignment")).toHaveCount(1);
  await expect(
    quiz.locator(".bso-quiz-assignment-context code"),
  ).toHaveText(
    /class FizzBuzz \{\s*String of\(int number\) \{ \/\* implementation \*\/ \}\s*\}/,
  );
  await expect(questions.locator("legend")).toHaveText([
    "Subquestion 1a (2 points)",
    "Subquestion 1b (3 points)",
    "Question 3",
  ]);
  const order = () =>
    questions.first().locator("input").evaluateAll((inputs) =>
      inputs.map((input) => input.value)
    );
  const initial = await order();
  expect(initial).toEqual(
    expectedShuffle ? ["B", "C", "D", "A"] : ["A", "B", "C", "D"],
  );
  await quiz.getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(quiz.getByRole("status")).toHaveText(
    "Choose an answer for every question.",
  );
  for (const [index, correct] of ["C", "D", "A"].entries()) {
    await questions.nth(index).locator(`input[value="${correct}"]`).check();
  }
  await quiz.getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(quiz.getByRole("status")).toHaveText("6 / 6 points");
  expect(await order()).toEqual(initial);
  await page.evaluate(() => {
    location.hash = "practice";
  });
  expect(await order()).toEqual(initial);
  await expect(questions.first().locator("input[value=C]")).toBeChecked();
  await quiz.getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(quiz.getByRole("status")).toHaveText("6 / 6 points");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(
      "Start a new attempt? All your current answers and feedback will be cleared.",
    );
    await dialog.dismiss();
  });
  await quiz.getByRole("button", { name: "New attempt", exact: true }).click();
  await expect(quiz.locator("input:checked")).toHaveCount(3);
  await expect(quiz.getByRole("status")).toHaveText("6 / 6 points");
  await expect(questions.first().locator(".bso-quiz-answer")).toBeVisible();
  expect(await order()).toEqual(initial);
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await quiz.getByRole("button", { name: "New attempt", exact: true }).click();
  await expect(quiz.locator("input:checked")).toHaveCount(0);
  await expect(questions.first().locator("input").first()).toBeFocused();
  await expect(quiz.getByRole("status")).toHaveText("");
  await expect(questions.first().locator(".bso-quiz-answer")).toBeHidden();
  expect(errors).toEqual([]);
});

test("quiz preview initializes after client navigation and supports keyboard answers", async ({ page }) => {
  await page.goto("/lessons/");
  await page.getByRole("link", {
    name: "Week 1: Authoring and links",
    exact: true,
  }).first().click();
  await page.getByRole("link", { name: "Quiz 1.1: FizzBuzz", exact: true })
    .click();
  const quiz = page.locator(".bso-quiz");
  await expect(quiz.getByRole("button", { name: "Check answers", exact: true }))
    .toHaveCount(1);
  const first = quiz.locator("input").first();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toBeChecked();
});

test("new attempt preserves short and multiple-response answers on cancel and clears them on confirm", async ({ page }) => {
  await page.setContent(`
    <div class="bso-quiz">
      <fieldset class="bso-quiz-question" data-response-type="open_short" data-correct-answers='["FizzBuzz"]'>
        <input type="text" class="bso-quiz-open-answer">
        <details class="bso-quiz-answer"><summary>Answer</summary>FizzBuzz</details>
        <details class="bso-quiz-explanation"><summary>Explanation</summary>Both divisors</details>
      </fieldset>
      <fieldset class="bso-quiz-question" data-correct-answers='["A","B"]'>
        <ul class="bso-quiz-options">
          <li><input type="checkbox" value="A"></li>
          <li><input type="checkbox" value="B"></li>
        </ul>
        <details class="bso-quiz-answer"><summary>Answer</summary>A and B</details>
      </fieldset>
    </div>
  `);
  await page.addScriptTag({
    path: require("node:path").resolve(__dirname, "../../assets/brightspacosaurus-quizzes.js"),
  });
  await page.evaluate(() => globalThis.bsoQuizzes.initializeQuizzes(document));
  const quiz = page.locator(".bso-quiz");
  const short = quiz.locator('input[type="text"]');
  await short.fill("FizzBuzz");
  await quiz.locator('input[value="A"]').check();
  await quiz.locator('input[value="B"]').check();
  await quiz.getByRole("button", { name: "Check answers", exact: true }).click();
  await expect(quiz.getByRole("status")).toHaveText("2 / 2 correct");
  const explanation = quiz.locator(".bso-quiz-explanation");
  await explanation.locator("summary").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await quiz.getByRole("button", { name: "New attempt", exact: true }).click();
  await expect(short).toHaveValue("FizzBuzz");
  await expect(quiz.locator("input:checked")).toHaveCount(2);
  await expect(quiz.getByRole("status")).toHaveText("2 / 2 correct");
  await expect(explanation).toHaveAttribute("open", "");
  page.once("dialog", (dialog) => dialog.accept());
  await quiz.getByRole("button", { name: "New attempt", exact: true }).click();
  await expect(short).toHaveValue("");
  await expect(short).toBeFocused();
  await expect(quiz.locator("input:checked")).toHaveCount(0);
  await expect(quiz.getByRole("status")).toHaveText("");
  await expect(explanation).toBeHidden();
  await expect(explanation).not.toHaveAttribute("open");
});

test("quiz preview leaves answers accessible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:3101${quizPath}`);
  await expect(page.locator(".bso-quiz-question")).toHaveCount(3);
  const answer = page.locator(".bso-quiz-answer").first();
  await answer.locator("summary").click();
  await expect(answer.locator("p")).toHaveText("FizzBuzz");
  await context.close();
});

test("a Dutch quiz shows Dutch buttons, messages, score and confirmation (quiz.locale nl)", async ({ page }) => {
  await page.setContent(`
    <div class="bso-quiz" data-locale="nl">
      <fieldset class="bso-quiz-question" data-points="2" data-correct-answers='["A"]'>
        <ul class="bso-quiz-options">
          <li><input type="radio" name="q" value="A"></li>
          <li><input type="radio" name="q" value="B"></li>
        </ul>
        <details class="bso-quiz-answer"><summary>Antwoord</summary>A</details>
      </fieldset>
    </div>
  `);
  await page.addScriptTag({
    path: require("node:path").resolve(__dirname, "../../assets/brightspacosaurus-quizzes.js"),
  });
  await page.evaluate(() => globalThis.bsoQuizzes.initializeQuizzes(document));
  const quiz = page.locator(".bso-quiz");
  await quiz.getByRole("button", { name: "Controleer antwoorden", exact: true }).click();
  await expect(quiz.getByRole("status")).toHaveText("Kies bij elke vraag een antwoord.");
  await quiz.locator('input[value="A"]').check();
  await quiz.getByRole("button", { name: "Controleer antwoorden", exact: true }).click();
  await expect(quiz.getByRole("status")).toHaveText("2 / 2 punten");
  let message = "";
  page.once("dialog", (dialog) => {
    message = dialog.message();
    return dialog.dismiss();
  });
  await quiz.getByRole("button", { name: "Nieuwe poging", exact: true }).click();
  expect(message).toBe(
    "Een nieuwe poging starten? Al je huidige antwoorden en feedback worden gewist.",
  );
  await expect(quiz.locator('input[value="A"]')).toBeChecked();
});

test("a quiz without a stated language keeps the English texts", async ({ page }) => {
  await page.setContent(`
    <div class="bso-quiz">
      <fieldset class="bso-quiz-question" data-correct-answers='["A"]'>
        <ul class="bso-quiz-options"><li><input type="radio" name="q" value="A"></li></ul>
        <details class="bso-quiz-answer"><summary>Answer</summary>A</details>
      </fieldset>
    </div>
  `);
  await page.addScriptTag({
    path: require("node:path").resolve(__dirname, "../../assets/brightspacosaurus-quizzes.js"),
  });
  await page.evaluate(() => globalThis.bsoQuizzes.initializeQuizzes(document));
  await expect(page.getByRole("button", { name: "New attempt", exact: true })).toBeVisible();
});
