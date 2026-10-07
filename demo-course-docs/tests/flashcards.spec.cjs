const { test, expect } = require("@playwright/test");

const preview = "/lessons/week-1/lesson-4-core-concepts";
const exported = "/flashcards-export.html";

for (
  const [target, url] of [["Docusaurus", preview], [
    "Brightspace HTML",
    exported,
  ]]
) {
  test(`${target}: all eight cards support mouse, keyboard and global controls`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const cards = page.locator(".bso-flashcards").first().locator(
      ".bso-flashcard",
    );
    const definitions = cards.locator(".bso-flashcard-definition");
    const buttons = cards.locator(".bso-flashcard-toggle");
    await expect(cards).toHaveCount(8);
    await expect(
      page.locator(".bso-flashcards").first().locator(
        ".bso-flashcard-definition[hidden]",
      ),
    ).toHaveCount(
      8,
    );
    await expect(cards.first()).toHaveCSS("border-radius", "8px");
    for (let i = 0; i < 8; i++) {
      await buttons.nth(i).click();
      await expect(definitions.nth(i)).toBeVisible();
      await expect(buttons.nth(i)).toHaveAttribute("aria-expanded", "true");
    }
    await expect(definitions.first().locator("strong")).toHaveText("unit test");
    await expect(definitions.first().locator("em")).toHaveText("in isolation");
    await buttons.last().focus();
    await page.keyboard.press("Enter");
    await expect(definitions.last()).toBeHidden();
    await page.keyboard.press("Space");
    await expect(definitions.last()).toBeVisible();
    const globalToggle = page.locator(".bso-flashcards").first().locator(
      ".bso-flashcard-global-toggle",
    );
    await globalToggle.click();
    await expect(
      page.locator(".bso-flashcards").first().locator(
        ".bso-flashcard-definition[hidden]",
      ),
    ).toHaveCount(
      8,
    );
    await expect(globalToggle).toHaveText("Show definitions");
    await globalToggle.click();
    await expect(
      page.locator(".bso-flashcards").first().locator(
        ".bso-flashcard-definition[hidden]",
      ),
    ).toHaveCount(
      0,
    );
    await expect(globalToggle).toHaveText("Hide definitions");
    expect(errors).toEqual([]);
  });

  test(`${target}: all definitions remain readable without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3101${url}`);
    const definitions = page.locator(".bso-flashcards").first().locator(
      ".bso-flashcard-definition",
    );
    await expect(definitions).toHaveCount(8);
    for (let i = 0; i < 8; i++) await expect(definitions.nth(i)).toBeVisible();
    await expect(
      page.locator(".bso-flashcards").first().locator(
        ".bso-flashcard-global-toggle",
      ),
    ).toHaveCount(0);
    await context.close();
  });
}

test("Docusaurus initializes after client navigation and does not duplicate controls", async ({ page }) => {
  await page.goto("/lessons/");
  await page.evaluate(() =>
    globalThis.flashcardNavigationMarker = "same document"
  );
  await page.getByRole("link", {
    name: "Lesson 1.4: Core concepts flashcards",
    exact: true,
  }).click();
  await expect(
    page.locator(".bso-flashcards").first().locator(
      ".bso-flashcard-definition[hidden]",
    ),
  ).toHaveCount(
    8,
  );
  expect(await page.evaluate(() => globalThis.flashcardNavigationMarker)).toBe(
    "same document",
  );
  await page.locator(".bso-flashcards").first().locator(".bso-flashcard-toggle")
    .first().click();
  await page.evaluate(() => location.hash = "practice-checklist");
  await expect(
    page.locator(".bso-flashcards").first().locator(".bso-flashcard-toolbar"),
  ).toHaveCount(1);
  await expect(
    page.locator(".bso-flashcards").first().locator(".bso-flashcard-definition")
      .first(),
  ).toBeVisible();
  await page.goBack();
  await page.goBack();
  await page.getByRole("link", {
    name: "Lesson 1.4: Core concepts flashcards",
    exact: true,
  }).click();
  await expect(
    page.locator(".bso-flashcards").first().locator(".bso-flashcard-toolbar"),
  ).toHaveCount(1);
  await expect(
    page.locator(".bso-flashcards").first().locator(
      ".bso-flashcard-definition[hidden]",
    ),
  ).toHaveCount(
    8,
  );
  await page.locator(".bso-flashcards").first().locator(".bso-flashcard-toggle")
    .last().click();
  await expect(
    page.locator(".bso-flashcards").first().locator(".bso-flashcard-definition")
      .last(),
  ).toBeVisible();
});

test("preview and export contain the same terms and rich definitions", async ({ page }) => {
  const snapshot = async (url) => {
    await page.goto(url);
    return page.locator(".bso-flashcard").evaluateAll((cards) =>
      cards.map((card) => ({
        term: card.querySelector(".bso-flashcard-term").textContent,
        definition: card.querySelector(".bso-flashcard-definition").innerHTML,
      }))
    );
  };
  expect(await snapshot(preview)).toEqual(await snapshot(exported));
});

for (
  const [target, url] of [["Docusaurus", preview], [
    "Brightspace HTML",
    exported,
  ]]
) {
  test(`${target}: heading-based glossary supports reveal and keeps surrounding lists`, async ({ page }) => {
    await page.goto(url);
    const set = page.locator(".bso-flashcards").nth(1);
    const list = set.locator("ul.bso-flashcard-list");
    await expect(set.locator(".bso-flashcard")).toHaveCount(8);
    await expect(list).toHaveCount(1);
    await expect(list.locator(":scope > li.bso-flashcard")).toHaveCount(8);
    await expect(set.locator(".bso-flashcard-definition[hidden]")).toHaveCount(
      8,
    );
    await expect(set.locator(".bso-flashcard-term").first()).toHaveText(
      "request",
    );
    const first = set.locator(".bso-flashcard-toggle").first();
    await first.focus();
    await page.keyboard.press("Enter");
    const definition = set.locator(".bso-flashcard-definition").first();
    await expect(definition)
      .toBeVisible();
    await expect(definition).toHaveCSS("display", "inline");
    await expect(definition.locator(":scope > p")).toHaveCSS("display", "inline");
    await expect(
      set.locator(".bso-flashcard-definition").first().locator("strong"),
    ).toHaveText("client");
    await set.locator(".bso-flashcard-global-toggle").click();
    await expect(set.locator(".bso-flashcard-definition[hidden]")).toHaveCount(
      0,
    );
    await expect(
      page.locator("li").filter({ hasText: "Check: this list must remain" }),
    ).toHaveCount(1);
  });

  test(`${target}: heading-based definitions remain visible without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3101${url}`);
    const definitions = page.locator(".bso-flashcards").nth(1).locator(
      ".bso-flashcard-definition",
    );
    await expect(definitions).toHaveCount(8);
    for (let i = 0; i < 8; i++) await expect(definitions.nth(i)).toBeVisible();
    await context.close();
  });
}
