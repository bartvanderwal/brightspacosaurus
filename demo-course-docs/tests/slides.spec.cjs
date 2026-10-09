const { test, expect } = require("@playwright/test");

async function setup(page) {
  await page.goto("/lessons/week-1/lesson-1-fizzbuzz");
  await page.evaluate(() => {
    window.slideOpens = [];
    window.open = (...args) => window.slideOpens.push(args);
    document.querySelector("article").insertAdjacentHTML(
      "beforeend",
      '<span hidden data-bso-slides="/slides/lesson/index.html"></span>',
    );
  });
}

test("Option+P uses physical KeyP and adds no visible UI", async ({ page }) => {
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
  expect(await page.evaluate(() => window.slideOpens)).toEqual([
    ["http://127.0.0.1:3101/slides/lesson/index.html", "_blank", "noopener,noreferrer"],
  ]);
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
  expect(await page.evaluate(() => window.slideOpens)).toEqual([]);
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
  expect(await page.evaluate(() => window.slideOpens)).toEqual([]);
  await page.evaluate(() => {
    document.querySelector("article").innerHTML = '<span hidden data-bso-slides="/slides/next/index.html"></span>';
  });
  await page.keyboard.press("Alt+p");
  expect(await page.evaluate(() => window.slideOpens[0][0])).toContain("/slides/next/index.html");
});
