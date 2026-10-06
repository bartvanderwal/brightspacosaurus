const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { remarkReaderPdfLinks } = require("../src/reader-links.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const readersDir = path.join(repoRoot, "examples/demo-course/readers");
const lessonPath = path.join(
  repoRoot,
  "examples/demo-course/lessons/week-1/lesson-2-test-strategy.md",
);

function transformReaderLink(url, { pdfExists = true, baseUrl = "/" } = {}) {
  const tree = {
    type: "root",
    children: [{ type: "link", url, children: [{ type: "text", value: "reader" }] }],
  };
  const plugin = remarkReaderPdfLinks({
    readersDir,
    previewStaticDir: "/preview-static",
    baseUrl,
    existsSync: (filePath) =>
      pdfExists && filePath === "/preview-static/readers/reader-testing-basics.pdf",
  });
  plugin()(tree, { path: lessonPath });
  return tree.children[0].url;
}

test("reader links point to the generated PDF in a configured base path", () => {
  expect(transformReaderLink("../../readers/reader-testing-basics.md", {
    baseUrl: "/brightspacosaurus/",
  })).toBe("pathname:///brightspacosaurus/readers/reader-testing-basics.pdf");
});

test("reader links stay on the HTML route when no PDF is available", () => {
  expect(transformReaderLink("../../readers/reader-testing-basics.md", {
    pdfExists: false,
  })).toBe("../../readers/reader-testing-basics.md");
});

test("external and non-reader links are unchanged", () => {
  expect(transformReaderLink("https://example.org/reader-testing-basics.md"))
    .toBe("https://example.org/reader-testing-basics.md");
  expect(transformReaderLink("../../lessons/week-1/lesson-1.md"))
    .toBe("../../lessons/week-1/lesson-1.md");
});

test("the demo lesson links directly to its PDF in the built preview", async ({ page }) => {
  await page.goto("/lessons/");
  await page.locator("article").getByRole("link", { name: /Lesson 1\.2/ })
    .click();
  await expect(page.locator('a[href="/readers/reader-testing-basics.pdf"]'))
    .toHaveCount(1);
});
