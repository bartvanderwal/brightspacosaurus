import fc from "fast-check";
import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join, resolve } from "@std/path";
import {
  resolveConfig,
  resolveFromCliOnly,
  validateConfig,
} from "../src/config-loader.ts";
import { runPrepare } from "../src/main.ts";
import { convertMarkdown } from "../src/markdown-converter.ts";
import { loadPackageVersion } from "../src/assets.ts";
import {
  DASHBOARD_DIRECTIVE,
  DASHBOARD_MARKER,
  DEFAULT_TEACHER_PAGE,
  insertVersionTable,
  replaceDashboardDirective,
  wrapTeacherPageTabs,
  renderVersionTable,
  resolveTeacherPage,
  VERSIONS_DIRECTIVE,
} from "../src/teacher-page.ts";
import type { ResolvedConfig } from "../src/types.ts";

const versions = {
  courseName: "OWE-1 FuStEn",
  courseVersion: "0.4.0",
  bsoVersion: "0.12.0",
};
const table = renderVersionTable(versions);

Deno.test("teacherPage defaults to for-teachers.md and rejects paths outside sourcesDir", () => {
  const base = { courseName: "Test", version: "1", sourcesDir: "lessons" };
  assertEquals(DEFAULT_TEACHER_PAGE, "for-teachers.md");
  assertEquals(resolveTeacherPage(), "for-teachers.md");
  assertEquals(resolveTeacherPage(" voor-docenten.md "), "voor-docenten.md");
  assertEquals(resolveTeacherPage("docent/info.md"), "docent/info.md");

  const defaults = resolveConfig(base, {}, Deno.cwd()).teacherPage;
  assertEquals(defaults, {
    path: resolve("lessons", "for-teachers.md"),
    explicit: false,
  });
  assertEquals(
    resolveConfig({ ...base, teacherPage: "voor-docenten.md" }, {}, Deno.cwd())
      .teacherPage,
    { path: resolve("lessons", "voor-docenten.md"), explicit: true },
  );
  assertEquals(
    resolveFromCliOnly({ sources: "src" }, Deno.cwd()).teacherPage,
    { path: resolve("src", "for-teachers.md"), explicit: false },
  );
  assertEquals(
    validateConfig({ ...base, teacherPage: "voor-docenten.md" }),
    true,
  );

  for (
    const value of [
      "",
      "  ",
      "teachers.html",
      "/abs/teachers.md",
      "../teachers.md",
      "a/../../teachers.md",
      42,
      null,
      ["teachers.md"],
    ]
  ) {
    assertThrows(
      () => validateConfig({ ...base, teacherPage: value }),
      Error,
      "teacherPage",
      String(value),
    );
  }
});

Deno.test("version table lists course and BSO versions and escapes table syntax", () => {
  assertEquals(
    table,
    "| Component | Version |\n| --- | --- |\n| OWE-1 FuStEn | `0.4.0` |\n| Brightspacosaurus | `0.12.0` |",
  );
  assertStringIncludes(
    renderVersionTable({
      ...versions,
      courseName: "A | B",
      courseVersion: "1`",
    }),
    "| A \\| B | `1` |",
  );
});

Deno.test("every directive line is replaced, including indented ones", () => {
  const source =
    `# For teachers\n\n${VERSIONS_DIRECTIVE}\n\nText\n\n  ${VERSIONS_DIRECTIVE}  \n`;
  assertEquals(
    insertVersionTable(source, versions),
    `# For teachers\n\n${table}\n\nText\n\n${table}\n`,
  );
});

Deno.test("without a directive the table follows the first H1 after frontmatter", () => {
  assertEquals(
    insertVersionTable(
      "---\nsidebar_position: 0\n---\n\n# Voor docenten\n\nIntro\n\n# Second",
      versions,
    ),
    `---\nsidebar_position: 0\n---\n\n# Voor docenten\n\n${table}\n\n\nIntro\n\n# Second`,
  );
  assertEquals(
    insertVersionTable("---\ntitle: x\n---\nIntro", versions),
    `---\ntitle: x\n---\n\n${table}\n\nIntro`,
  );
  assertEquals(insertVersionTable("Intro", versions), `\n${table}\n\nIntro`);
  assertEquals(
    insertVersionTable("## Only H2\n\nIntro", versions),
    `\n${table}\n\n## Only H2\n\nIntro`,
  );
});

Deno.test("directives and headings inside fenced code blocks are left alone", () => {
  const source =
    `\`\`\`md\n# Not a heading\n${VERSIONS_DIRECTIVE}\n\`\`\`\n\n~~~~\n${VERSIONS_DIRECTIVE}\n~~~\n~~~~\n\n# Title`;
  assertEquals(
    insertVersionTable(source, versions),
    `${source}\n\n${table}\n`,
  );
});

Deno.test("insertVersionTable adds exactly one table and keeps all author lines (property)", () => {
  fc.assert(
    fc.property(
      fc.array(fc.stringMatching(/^[A-Za-z0-9 .,#-]{0,30}$/), {
        maxLength: 12,
      }),
      fc.stringMatching(/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,2}$/),
      (lines, courseVersion) => {
        const source = lines.join("\n");
        const page = { ...versions, courseVersion };
        const output = insertVersionTable(source, page);
        const rendered = renderVersionTable(page);
        assertEquals(output.split(rendered).length - 1, 1);
        assertEquals(
          output.replace(`\n${rendered}\n`, "").split("\n")
            .filter((line) => line !== ""),
          lines.filter((line) => line !== ""),
        );
        assertEquals(insertVersionTable(source, page), output);
      },
    ),
    { numRuns: 100 },
  );
});

function testConfig(repoRoot: string, explicit: boolean): ResolvedConfig {
  const sourcesDir = join(repoRoot, "lessons");
  return {
    repoRoot,
    sourcesDir,
    readersDir: null,
    readerCoverLogo: null,
    assetsDir: null,
    outputDir: join(repoRoot, "build", "brightspace"),
    courseName: "Teacher Course",
    version: "2.1.0",
    customCss: null,
    name: "teacher-course",
    docusaurusDir: null,
    teacherManual: null,
    teacherDashboard: null,
    quiz: { maxAttempts: 0, shuffleAnswers: false },
    teacherPage: { path: join(sourcesDir, "for-teachers.md"), explicit },
    diagrams: {
      krokiUrl: "https://kroki.io",
      output: "img-html-base64",
      failOnError: true,
      locale: "en",
    },
  };
}

async function tempRepo(): Promise<string> {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({ dir: "build", prefix: "teacher-" });
  await Deno.mkdir(join(root, "lessons", "week-1"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "lessons", "week-1", "lesson-1.md"),
    `# Lesson 1\n\n${VERSIONS_DIRECTIVE}\n`,
  );
  return resolve(root);
}

Deno.test("prepare fills in versions on the teacher page only", async () => {
  const repoRoot = await tempRepo();
  try {
    const config = testConfig(repoRoot, false);
    await Deno.writeTextFile(
      config.teacherPage!.path,
      `# For teachers\n\n${VERSIONS_DIRECTIVE}\n`,
    );
    await runPrepare(config, false, { skipReaders: true });
    const teacherHtml = await Deno.readTextFile(
      join(config.outputDir, "content", "for-teachers.html"),
    );
    const lessonHtml = await Deno.readTextFile(
      join(config.outputDir, "content", "week-1", "lesson-1.html"),
    );
    assertStringIncludes(teacherHtml, "<td>Teacher Course</td>");
    assertStringIncludes(teacherHtml, "<code>2.1.0</code>");
    assertStringIncludes(
      teacherHtml,
      `<code>${await loadPackageVersion()}</code>`,
    );
    assertEquals(teacherHtml.includes(VERSIONS_DIRECTIVE), false);
    assertStringIncludes(lessonHtml, VERSIONS_DIRECTIVE);
    assertEquals(lessonHtml.includes("<table>"), false);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("a missing default teacher page is fine, a missing configured one fails", async () => {
  const repoRoot = await tempRepo();
  try {
    await runPrepare(testConfig(repoRoot, false), false, { skipReaders: true });
    const error = await assertRejects(
      () => runPrepare(testConfig(repoRoot, true), false, { skipReaders: true }),
      Error,
      "Teacher page not found: lessons/for-teachers.md",
    );
    assertEquals((error as Error & { exitCode: number }).exitCode, 3);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// {@bso-teacher-dashboard}: Voortgangsverkenner in tabs on the teacher page (#37)
// ---------------------------------------------------------------------------

Deno.test("replaceDashboardDirective replaces the directive outside code blocks only", () => {
  const md = `# Docenten\n\n${DASHBOARD_DIRECTIVE}\n\n\`\`\`text\n${DASHBOARD_DIRECTIVE}\n\`\`\`\n`;
  const result = replaceDashboardDirective(md, "X");
  assertEquals(result.found, true);
  assertEquals(result.markdown, `# Docenten\n\nX\n\n\`\`\`text\n${DASHBOARD_DIRECTIVE}\n\`\`\`\n`);
  assertEquals(replaceDashboardDirective("# Geen\n", "X").found, false);
});

Deno.test("wrapTeacherPageTabs keeps the H1 above two tabs and embeds the dashboard", () => {
  const body = `<h1>Voor docenten</h1>\n<p>Info</p>\n<p>${DASHBOARD_MARKER}</p>\n<p>Meer</p>`;
  const html = wrapTeacherPageTabs(body, "docenten/voortgangsverkenner.html");
  assertEquals(html.startsWith("<h1>Voor docenten</h1>"), true);
  assertEquals(html.includes(DASHBOARD_MARKER), false);
  assertStringIncludes(html, 'role="tablist"');
  assertStringIncludes(html, ">Informatie</button>");
  assertStringIncludes(html, ">Voortgangsverkenner</button>");
  assertStringIncludes(html, '<iframe class="bso-dashboard-frame" src="docenten/voortgangsverkenner.html"');
  assertStringIncludes(html, 'target="_blank" rel="noopener noreferrer"');
  const infoPanel = html.slice(html.indexOf('id="bso-panel-info"'), html.indexOf('id="bso-panel-dashboard"'));
  assertStringIncludes(infoPanel, "<p>Info</p>");
  assertStringIncludes(infoPanel, "<p>Meer</p>");
});

Deno.test("wrapTeacherPageTabs escapes the dashboard URL in attributes", () => {
  const html = wrapTeacherPageTabs("<p>x</p>", 'a"b.html');
  assertStringIncludes(html, 'src="a&quot;b.html"');
});

async function convertTeacherPage(markdown: string, src: string | null) {
  const root = await Deno.makeTempDir();
  try {
    const sourcePath = join(root, "voor-docenten.md");
    await Deno.writeTextFile(sourcePath, markdown);
    const result = await convertMarkdown({
      sourcePath,
      outputDir: join(root, "out"),
      repoRoot: root,
      teacherPageVersions: { courseName: "Cursus", courseVersion: "1.0.0", bsoVersion: "0.0.0" },
      teacherDashboardSrc: src,
    });
    return await Deno.readTextFile(result.outputPath);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("teacher page with the directive gets tabs and the tab script", async () => {
  const html = await convertTeacherPage(
    `# Voor docenten\n\n${DASHBOARD_DIRECTIVE}\n\nUitleg.\n`,
    "docenten/voortgangsverkenner.html",
  );
  assertStringIncludes(html, '<div class="bso-tabs" data-bso-tabs>');
  assertStringIncludes(html, 'src="docenten/voortgangsverkenner.html"');
  assertStringIncludes(html, "initializeTabs");
  assertEquals(html.includes(DASHBOARD_MARKER), false);
});

Deno.test("teacher page directive without teacherDashboard shows a note instead of tabs", async () => {
  const html = await convertTeacherPage(`# Voor docenten\n\n${DASHBOARD_DIRECTIVE}\n`, null);
  assertEquals(html.includes('<div class="bso-tabs" data-bso-tabs>'), false);
  assertStringIncludes(html, "niet geconfigureerd");
});
