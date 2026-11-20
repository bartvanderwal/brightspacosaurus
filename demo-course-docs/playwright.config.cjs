const path = require("node:path");

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(
  __dirname,
  "../build/slide-browser",
);
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.cjs",
  use: {
    baseURL: "http://127.0.0.1:3101",
    browserName: "chromium",
    channel: process.env.BSO_BROWSER_CHANNEL || "chromium",
  },
  webServer: {
    command: "npm run serve -- --host 127.0.0.1 --port 3101 --no-open",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
  },
});
