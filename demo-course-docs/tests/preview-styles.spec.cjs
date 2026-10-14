const { test, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const webpack = require("webpack");

test("bso preview gives a course app the full CSS through a plain relative import (#95)", async () => {
  test.setTimeout(120_000);
  const root = path.resolve(__dirname, "../..");
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  const project = fs.mkdtempSync(path.join(root, "build/preview-styles-"));
  try {
    // A course repository whose Docusaurus app does nothing on `npm start`:
    // the test checks what `bso preview` prepares, not Docusaurus itself.
    const app = path.join(project, "docs-app");
    fs.mkdirSync(path.join(app, "node_modules"), { recursive: true });
    fs.mkdirSync(path.join(app, "src/css"), { recursive: true });
    fs.mkdirSync(path.join(project, "lessons"));
    fs.writeFileSync(path.join(project, "lessons/week-1.md"), "# Week 1\n");
    fs.writeFileSync(
      path.join(project, "brightspacosaurus.config.json"),
      JSON.stringify({
        courseName: "Fixture",
        version: "1.0.0",
        sourcesDir: "lessons/",
        docusaurusDir: "docs-app",
      }),
    );
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "fixture-app", scripts: { start: "node -e 0" } }),
    );
    // The import documented in the user manual (section 10.1).
    fs.writeFileSync(
      path.join(app, "src/css/custom.css"),
      "@import '../generated/brightspacosaurus.css';\n.course-own { color: red; }\n",
    );

    execFileSync("deno", [
      "run", "--allow-read", "--allow-write", "--allow-env", "--allow-net",
      "--allow-run=npm,pandoc,git", path.join(root, "src/main.ts"), "preview",
    ], { cwd: project, stdio: "pipe" });

    expect(fs.readFileSync(path.join(app, "src/generated/.gitignore"), "utf8")).toBe("*\n");
    const compiler = webpack({
      mode: "development",
      context: app,
      entry: "./src/css/custom.css",
      output: { path: path.join(app, "dist"), filename: "styles.js" },
      module: { rules: [{
        test: /\.css$/,
        use: [{ loader: require.resolve("css-loader") }],
      }] },
    });
    try {
      const stats = await new Promise((resolve, reject) => {
        compiler.run((error, result) => error ? reject(error) : resolve(result));
      });
      expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
      const bundled = fs.readFileSync(path.join(app, "dist/styles.js"), "utf8");
      for (const selector of [
        ".bso-quiz", ".bso-flashcards", ".bso-tabs", ".bso-copy-btn", ".course-own",
      ]) {
        expect(bundled).toContain(selector);
      }
    } finally {
      await new Promise((resolve, reject) => {
        compiler.close((error) => error ? reject(error) : resolve());
      });
    }
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
