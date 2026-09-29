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
  await expect(quiz.getByRole("status")).toHaveText("3 / 3 correct");
  expect(await order()).toEqual(initial);
  await page.evaluate(() => {
    location.hash = "practice";
  });
  expect(await order()).toEqual(initial);
  await expect(questions.first().locator("input[value=C]")).toBeChecked();
  await quiz.getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(quiz.getByRole("status")).toHaveText("3 / 3 correct");
  await quiz.getByRole("button", { name: "New attempt", exact: true }).click();
  await expect(quiz.locator("input:checked")).toHaveCount(0);
  await expect(questions.first().locator("input").first()).toBeFocused();
  await expect(quiz.getByRole("status")).toHaveText("");
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
