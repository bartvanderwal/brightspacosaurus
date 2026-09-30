const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

// A minimal Brightspace shell on the test origin: the viewer page embeds the
// exported handbook as topic 1 in an iframe, as Brightspace does (#41).
const handbook = fs.readFileSync(
  path.join(__dirname, "..", "build", "navigation-export.html"),
  "utf8",
);
const base = "/content/enforced/123-DEMO";
const shell = (topicId, src) =>
  `<!DOCTYPE html><title>Topic ${topicId}</title>` +
  `<nav id="menu">Topic ${topicId}</nav><iframe id="topic" src="${src}"></iframe>`;

async function brightspace(page, toc, { tocStatus = 200 } = {}) {
  const requests = [];
  await page.route("**/d2l/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    const view = url.pathname.match(/viewContent\/(\d+)\/View$/);
    if (view) {
      const src = view[1] === "1"
        ? `${base}/README.html`
        : `${base}/week-1/lesson-1-fizzbuzz.html`;
      return route.fulfill({ contentType: "text/html", body: shell(view[1], src) });
    }
    if (url.pathname === "/d2l/api/versions/le") {
      return route.fulfill({ json: { LatestVersion: "1.80" } });
    }
    if (url.pathname === "/d2l/api/le/1.80/123/content/toc") {
      return route.fulfill({ status: tocStatus, json: toc });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await page.route(`**${base}/**`, (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      contentType: "text/html",
      body: url.pathname.endsWith("/README.html")
        ? handbook
        : "<!DOCTYPE html><h1>FizzBuzz lesson</h1>",
    });
  });
  await page.goto("/d2l/le/content/123/viewContent/1/View");
  return requests;
}

const toc = {
  Modules: [{
    Topics: [{ TopicId: 1, Url: `${base}/README.html` }],
    Modules: [{
      Topics: [{ TopicId: 2, Url: `${base}/week-1/lesson-1-fizzbuzz.html` }],
    }],
  }],
};

test("a lesson link opens the target topic in Brightspace, so the menu follows", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await brightspace(page, toc);
  await page.frameLocator("#topic").getByRole("link", {
    name: "Lesson 1.1: FizzBuzz",
  }).click();
  await expect(page).toHaveURL(/\/d2l\/le\/content\/123\/viewContent\/2\/View$/);
  await expect(page.locator("#menu")).toHaveText("Topic 2");
  expect(requests).toContain("/d2l/api/le/1.80/123/content/toc");
  expect(errors).toEqual([]);
});

for (
  const [scenario, tocBody, options] of [
    ["the topic is not in the table of contents", { Modules: [] }, {}],
    ["the table of contents is unavailable", {}, { tocStatus: 403 }],
  ]
) {
  test(`the plain relative link still works when ${scenario}`, async ({ page }) => {
    await brightspace(page, tocBody, options);
    const frame = page.frameLocator("#topic");
    await frame.getByRole("link", { name: "Lesson 1.1: FizzBuzz" }).click();
    await expect(frame.locator("h1")).toHaveText("FizzBuzz lesson");
    await expect(page).toHaveURL(/viewContent\/1\/View$/);
  });
}

test("outside Brightspace the script leaves links alone", async ({ page }) => {
  await page.route("**/standalone/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: route.request().url().endsWith("README.html")
        ? handbook
        : "<!DOCTYPE html><h1>FizzBuzz lesson</h1>",
    }));
  await page.goto("/standalone/README.html");
  await page.getByRole("link", { name: "Lesson 1.1: FizzBuzz" }).click();
  await expect(page).toHaveURL(/\/standalone\/week-1\/lesson-1-fizzbuzz\.html$/);
  await expect(page.locator("h1")).toHaveText("FizzBuzz lesson");
});
