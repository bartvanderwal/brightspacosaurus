const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test("dashboard restores cached progress without tokens, refreshes stale repos and clears local data", async ({ page }) => {
  const assets = path.resolve(__dirname, "../../assets/teacher-dashboard");
  const today = new Date().toISOString().slice(0, 10);
  const config = {
    gitlabUrl: "https://gitlab.example.org",
    groupPath: "cache-test",
    subgroups: ["class-a"],
    repos: [{ prefix: "old", label: "Old" }, { prefix: "current", label: "Current" }],
    weeks: [
      { title: "Old", startsOn: "2020-01-01", repos: ["old"] },
      { title: "Current", startsOn: today, repos: ["current"] },
    ],
  };
  const projects = [
    { id: 1, path: "old-alice", web_url: "https://gitlab.example.org/old-alice" },
    { id: 2, path: "current-alice", web_url: "https://gitlab.example.org/current-alice" },
  ];
  const repoCalls = [];
  await page.route("https://gitlab.example.org/api/v4/**", async (route) => {
    const url = new URL(route.request().url());
    const project = url.pathname.match(/\/projects\/(\d+)\//);
    if (project) repoCalls.push(Number(project[1]));
    const json = url.pathname.endsWith("/subgroups") ? [{ path: "class-a" }]
      : url.pathname.endsWith("/projects") ? projects : [];
    await route.fulfill({ json });
  });
  await page.route("**/dashboard-cache/**", async (route) => {
    const relative = new URL(route.request().url()).pathname.split("/dashboard-cache/")[1];
    let body = fs.readFileSync(path.join(assets, relative || "index.html"));
    if (!relative || relative === "index.html") {
      body = body.toString().replace(
        /(<script id="bso-dashboard-config" type="application\/json">)[\s\S]*?(<\/script>)/,
        `$1${JSON.stringify(config)}$2`,
      );
    }
    await route.fulfill({
      body,
      contentType: relative.endsWith(".js") ? "application/javascript"
        : relative.endsWith(".css") ? "text/css"
        : relative.endsWith(".woff2") ? "font/woff2" : "text/html",
    });
  });
  const login = async () => {
    await page.getByLabel("GitLab-token (alleen lezen)", { exact: true }).fill("test-secret");
    await page.getByRole("button", { name: "Controleer en gebruik", exact: true }).click();
    await expect(page.getByText("Geaccepteerd ✓", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ververs nu/ })).toBeEnabled();
    await expect(page.getByText(/Laatst ververst/)).toBeVisible();
  };
  await page.goto("/dashboard-cache/index.html");
  await login();
  expect(repoCalls).toEqual(expect.arrayContaining([1, 2]));
  const key = await page.evaluate(() => Object.keys(localStorage)
    .find((item) => item.startsWith("bso-dashboard-cache-v1:")));
  expect(key).toBeTruthy();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).not.toContain("test-secret");
  repoCalls.length = 0;
  await page.reload();
  await expect(page.getByLabel("GitLab-token (alleen lezen)", { exact: true })).toHaveValue("");
  await login();
  expect(repoCalls).toEqual([]);
  await page.evaluate((key) => {
    const envelope = JSON.parse(localStorage.getItem(key));
    envelope.data.students.alice.repos.find((repo) => repo.prefix === "current").fetchedAt =
      new Date(Date.now() - 6 * 60_000).toISOString();
    localStorage.setItem(key, JSON.stringify(envelope));
  }, key);
  await page.reload();
  await login();
  expect(repoCalls).toContain(2);
  expect(repoCalls).not.toContain(1);
  repoCalls.length = 0;
  await page.getByRole("button", { name: /Ververs nu/ }).click();
  await expect(page.getByRole("button", { name: /Ververs nu/ })).toBeEnabled();
  expect(repoCalls).toContain(2);
  await page.getByRole("button", { name: "Cache wissen", exact: true }).click();
  expect(await page.evaluate(() => Object.keys(localStorage)
    .filter((item) => item.startsWith("bso-dashboard-cache-v1:")))).toEqual([]);
  await expect(page.getByText("Nog geen gegevens.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vergeet token", exact: true }).click();
  await expect(page.getByLabel("GitLab-token (alleen lezen)", { exact: true })).toHaveValue("");
  await page.evaluate((key) => localStorage.setItem(key, "{corrupt"), key);
  await page.reload();
  await login();
  await expect(page.getByRole("alert")).toContainText("verwijderd");
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "localStorage", {
      get() { throw new Error("Storage blocked"); },
    });
  });
  await page.reload();
  await login();
  await expect(page.getByRole("alert")).toContainText("Storage blocked");
});
