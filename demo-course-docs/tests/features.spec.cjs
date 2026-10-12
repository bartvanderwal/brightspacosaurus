const { test, expect } = require("@playwright/test");

test("feature settings have visible copy buttons and copy valid JSON", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/lessons/features");
  await page.mouse.move(0, 0);
  const blocks = page.locator("article .theme-code-block.language-json");
  for (const [index, expected] of [
    { courseName: "My course", version: "1.0.0", sourcesDir: "lessons/" },
    { quiz: { maxAttempts: 0, shuffleAnswers: true } },
    { diagrams: { krokiUrl: "http://localhost:8000" } },
    { docusaurusDir: "my-docusaurus-site" },
    { teacherDashboard: {
      gitlabUrl: "https://gitlab.example.org",
      groupPath: "my-course-2026",
      subgroups: ["class-a", "class-b"],
      repos: [{ prefix: "n1-assignment", label: "N1 Assignment" }],
    } },
    { readersDir: "readers/", readerCoverLogo: "shared/logo.png" },
    { flashcards: { sectionHeadings: ["Core concepts"] } },
    { teacherPage: "for-teachers.md" },
    { readersModule: { slug: "general", title: "General" } },
  ].entries()) {
    const button = blocks.nth(index).getByRole("button", {
      name: "Copy code to clipboard",
      exact: true,
    });
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS("opacity", "1");
    await button.click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(copied)).toEqual(expected);
    await page.mouse.move(0, 0);
  }
  await expect(page.locator("article")).toContainText("deno task build");
  await expect(page.locator("article")).toContainText("deno task pack");
  await expect(blocks).toHaveCount(9);
});
