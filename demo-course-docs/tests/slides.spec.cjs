const { test, expect } = require("@playwright/test");

async function setup(page) {
  await page.goto("/lessons/week-1/lesson-1-fizzbuzz");
  // Wait for hydration: React would replace a span inserted before it finished.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    document.querySelector("article").insertAdjacentHTML(
      "beforeend",
      '<span hidden data-bso-slides="/slides/lesson/index.html"></span>',
    );
  });
}

test("Option+P uses physical KeyP; a visible button links to the slides", async ({ page }) => {
  await setup(page);
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", {
      key: "π", code: "KeyP", altKey: true, bubbles: true, cancelable: true,
    });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.locator("[data-bso-slides]")).toBeHidden();
  const button = page.locator("a.bso-slides-button");
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("href", /\/slides\/lesson\/index\.html$/);
  // The same tab, and the browser's Back button returns to the lesson.
  await page.waitForURL("**/slides/lesson/index.html");
  await expect(button).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/lessons\/week-1\/lesson-1-fizzbuzz$/);
});

test("editable fields and their descendants keep Alt+P", async ({ page }) => {
  await setup(page);
  for (const html of [
    "<input>", "<textarea></textarea>", "<select><option>A</option></select>",
    '<div contenteditable="true"><span tabindex="0">Editable child</span></div>',
    '<div contenteditable=""><span tabindex="0">Editable child</span></div>',
  ]) {
    expect(await page.evaluate((markup) => {
      const container = document.createElement("div");
      container.innerHTML = markup;
      document.body.append(container);
      const field = container.querySelector("span") || container.firstElementChild;
      field.focus();
      const event = new KeyboardEvent("keydown", {
        code: "KeyP", altKey: true, bubbles: true, cancelable: true,
      });
      field.dispatchEvent(event);
      container.remove();
      return event.defaultPrevented;
    }, html)).toBe(false);
  }
  expect(new URL(page.url()).pathname).toBe("/lessons/week-1/lesson-1-fizzbuzz");
});

test("print, repeat and lessons without slides are untouched; navigation selects the current lesson", async ({ page }) => {
  await setup(page);
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true, ctrlKey: true }, { altKey: true, repeat: true }]) {
    expect(await page.evaluate((flags) => {
      const event = new KeyboardEvent("keydown", {
        code: "KeyP", bubbles: true, cancelable: true, ...flags,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }, modifiers)).toBe(false);
  }
  await page.evaluate(() => document.querySelector("[data-bso-slides]").remove());
  await page.keyboard.press("Alt+p");
  expect(new URL(page.url()).pathname).toBe("/lessons/week-1/lesson-1-fizzbuzz");
  await page.evaluate(() => {
    document.querySelector("article").innerHTML = '<span hidden data-bso-slides="/slides/next/index.html"></span>';
  });
  await page.keyboard.press("Alt+p");
  await page.waitForURL("**/slides/next/index.html");
});
