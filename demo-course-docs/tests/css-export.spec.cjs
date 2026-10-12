const { test, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const webpack = require("webpack");

test("the released npm package resolves the full CSS through Webpack without a checkout path (#95)", async () => {
  test.setTimeout(120_000);
  const root = path.resolve(__dirname, "../..");
  const fixture = fs.mkdtempSync(path.join(root, "build/css-export-"));
  try {
    const tarball = path.join(fixture, "bso.tgz");
    execFileSync("deno", [
      "pack", "--allow-dirty",
      "--ignore=tests/", "--ignore=**/*_test.ts", "--ignore=**/*.test.ts",
      "--ignore=src/marp-exporter.ts", "--output", tarball,
    ], { cwd: root, stdio: "pipe" });
    const packageDir = path.join(
      fixture, "node_modules/@bartvanderwal/brightspacosaurus",
    );
    fs.mkdirSync(packageDir, { recursive: true });
    execFileSync("tar", [
      "-xzf", tarball, "--strip-components=1", "-C", packageDir,
    ]);
    execFileSync("deno", ["eval", `
      import { fixPackage } from "./utils/release-npm.ts";
      const dir = Deno.args[0];
      const file = dir + "/package.json";
      const { packageJson } = fixPackage(
        JSON.parse(await Deno.readTextFile(file)),
        ["assets/brightspacosaurus.css"],
      );
      await Deno.writeTextFile(file, JSON.stringify(packageJson));
    `, packageDir], { cwd: root, stdio: "pipe" });
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
    );
    expect(packageJson.exports["./css"]).toBe("./assets/brightspacosaurus.css");
    fs.writeFileSync(path.join(fixture, "custom.css"),
      "@import '@bartvanderwal/brightspacosaurus/css';\n");
    const compiler = webpack({
      mode: "development",
      context: fixture,
      entry: "./custom.css",
      output: { path: path.join(fixture, "dist"), filename: "styles.js" },
      module: { rules: [{
        test: /\.css$/,
        use: [{ loader: require.resolve("css-loader") }],
      }] },
    });
    try {
      const stats = await new Promise((resolve, reject) => {
        compiler.run((error, stats) => error ? reject(error) : resolve(stats));
      });
      expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
      const bundled = fs.readFileSync(path.join(fixture, "dist/styles.js"), "utf8");
      for (const selector of [
        ".bso-quiz", ".bso-flashcards", ".bso-tabs", ".bso-copy-btn",
      ]) {
        expect(bundled).toContain(selector);
      }
    } finally {
      await new Promise((resolve, reject) => {
        compiler.close((error) => error ? reject(error) : resolve());
      });
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
