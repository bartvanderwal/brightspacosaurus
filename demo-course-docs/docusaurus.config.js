const path = require("node:path");
const fs = require("node:fs");
const { remarkFlashcards, resolveFlashcardsOptions } = require(
  "../src/flashcards.ts",
);
const { remarkDiagrams } = require("../src/diagram-renderer.ts");
const { expandIncludes } = require("../src/includes.ts");
const {
  DASHBOARD_PREVIEW_NOTE,
  insertVersionTable,
  replaceDashboardDirective,
  resolveTeacherPage,
} = require("../src/teacher-page.ts");
const {
  sortManifestEntriesForNavigation,
} = require("../src/manifest-builder.ts");

const { remarkQuizPreview } = require("../src/quiz-preview.ts");
const { resolveQuizOptions } = require("../src/quiz-config.ts");
const { resolveDiagramsConfig } = require("../src/diagram-config.ts");
const course = require("../brightspacosaurus.config.json");
const quizOptions = resolveQuizOptions(
  process.env.BSO_PREVIEW_QUIZ_CONFIG
    ? JSON.parse(process.env.BSO_PREVIEW_QUIZ_CONFIG)
    : course.quiz,
);
const flashcardOptions = resolveFlashcardsOptions(
  process.env.BSO_PREVIEW_FLASHCARDS_CONFIG
    ? JSON.parse(process.env.BSO_PREVIEW_FLASHCARDS_CONFIG)
    : course.flashcards,
);
const diagramOptions = resolveDiagramsConfig(course);
// `bso preview` passes the selected course's teacher page and versions.
const teacherPage = process.env.BSO_PREVIEW_TEACHER_PAGE
  ? JSON.parse(process.env.BSO_PREVIEW_TEACHER_PAGE)
  : {
    path: path.resolve(
      __dirname,
      "..",
      course.sourcesDir,
      resolveTeacherPage(course.teacherPage),
    ),
    courseName: course.courseName,
    courseVersion: course.version,
    bsoVersion: require("../deno.json").version,
  };
const includeHost = {
  resolve: path.join,
  dirname: path.dirname,
  readFile: (file) => {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
  },
  warn: console.warn,
};

// Reorders doc items per sidebar level like the Brightspace manifest; categories keep their slots.
function sortLikeBrightspace(items, titles) {
  const docs = items.filter((item) => item.type === "doc");
  const queue = sortManifestEntriesForNavigation(docs.map((item) => ({
    id: item.id,
    title: titles.get(item.id) ?? item.id,
    href: item.id,
    type: path.basename(item.id).startsWith("quiz-")
      ? "imsqti_xmlv1p2/imscc_xmlv1p3/assessment"
      : "webcontent",
  }))).map((entry) => docs.find((doc) => doc.id === entry.id));
  return items.map((item) => {
    if (item.type === "doc") return queue.shift();
    if (item.type === "category") {
      return { ...item, items: sortLikeBrightspace(item.items, titles) };
    }
    return item;
  });
}

module.exports = {
  title: "Demo Course Preview",
  tagline: "Preview for Brightspacosaurus demo course",
  url: "http://localhost:3000",
  baseUrl: "/",
  onBrokenLinks: "throw",
  markdown: {
    format: "detect",
    preprocessor: ({ filePath, fileContent }) => {
      const markdown = expandIncludes(
        fileContent,
        path.dirname(filePath),
        includeHost,
      );
      if (path.resolve(filePath) !== teacherPage.path) return markdown;
      // The Voortgangsverkenner only exists after import in Brightspace (#37).
      return replaceDashboardDirective(
        insertVersionTable(markdown, teacherPage),
        DASHBOARD_PREVIEW_NOTE,
      ).markdown;
    },
  },
  clientModules: [
    require.resolve("./src/flashcards-client.js"),
    require.resolve("remark-kroki-a11y/diagramTabs.js"),
  ],
  presets: [["@docusaurus/preset-classic", {
    docs: {
      path: "../examples/demo-course",
      include: ["lessons/**/*.md", "readers/**/*.md"],
      routeBasePath: "/",
      sidebarItemsGenerator: async (
        { defaultSidebarItemsGenerator, ...args },
      ) =>
        sortLikeBrightspace(
          await defaultSidebarItemsGenerator(args),
          new Map(args.docs.map((doc) => [doc.id, doc.title])),
        ),
      beforeDefaultRemarkPlugins: [[remarkQuizPreview, quizOptions]],
      remarkPlugins: [[remarkFlashcards, flashcardOptions], [
        remarkDiagrams,
        diagramOptions,
      ]],
    },
    blog: false,
    theme: { customCss: require.resolve("./src/css/custom.css") },
  }]],
  themeConfig: {
    navbar: {
      title: "Demo Course",
      items: [{ to: "/lessons/", label: "Handbook", position: "left" }],
    },
    prism: { additionalLanguages: ["java", "bash"] },
  },
};
