const path = require("node:path");
const fs = require("node:fs");
const { remarkFlashcards, resolveFlashcardsOptions } = require(
  "../src/flashcards.ts",
);
const { remarkDiagrams } = require("../src/diagram-renderer.ts");
const { expandIncludes } = require("../src/includes.ts");
const {
  insertVersionTable,
  remarkTeacherDashboard,
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
// BSO_KROKI_URL points the build to another Kroki server, for example the
// Kroki service container in the GitHub Pages workflow.
const diagramOptions = resolveDiagramsConfig(
  process.env.BSO_KROKI_URL
    ? { ...course, diagrams: { ...course.diagrams, krokiUrl: process.env.BSO_KROKI_URL } }
    : course,
);
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

// Same tabs as the Brightspace export, on the teacher page only (#37). `bso preview`
// serves the dashboard files from BSO_PREVIEW_STATIC_DIR; without it the page
// shows a note how to start the preview with the dashboard.
const previewStaticDir = process.env.BSO_PREVIEW_STATIC_DIR || "";
const baseUrl = process.env.DOCS_BASE_URL || "/";
function remarkTeacherPageTabs() {
  const transform = remarkTeacherDashboard({
    src: previewStaticDir ? `${baseUrl}docenten/voortgangsverkenner.html` : null,
    note: "Voortgangsverkenner: start de preview met `bso preview` (met teacherDashboard in de configuratie) om hem hier te zien.",
  });
  return (tree, file) => {
    if (file.path && path.resolve(file.path) === teacherPage.path) transform(tree);
  };
}

// Readers are PDFs in Brightspace. When the preview has the built PDF (in
// BSO_PREVIEW_STATIC_DIR/readers), the reader page starts with a link to it;
// the web version below is the second option (phone, Ctrl+F).
function remarkReaderPdfLink() {
  return (tree, file) => {
    if (!previewStaticDir || !file.path) return;
    const name = path.basename(file.path, ".md");
    if (!name.startsWith("reader-")) return;
    if (!fs.existsSync(path.join(previewStaticDir, "readers", `${name}.pdf`))) return;
    const text = (value) => ({ type: "text", value });
    const note = {
      type: "blockquote",
      children: [{
        type: "paragraph",
        children: [
          text("📄 "),
          { type: "strong", children: [text("This reader is a PDF in Brightspace: ")] },
          {
            type: "link",
            // pathname:// keeps Docusaurus from routing a static file.
            url: `pathname://${baseUrl}readers/${name}.pdf`,
            children: [text(`download ${name}.pdf`)],
          },
          text(". Below is the same text as a web page, easier to read on a phone and to search."),
        ],
      }],
    };
    const firstHeading = tree.children.findIndex((node) => node.type === "heading");
    tree.children.splice(firstHeading + 1, 0, note);
  };
}

// Software guidebook, user manual and ADRs from docs/ (#33). Links that leave
// docs/ (README, CHANGELOG, source files) point to the file on GitHub.
const docsDir = path.resolve(__dirname, "../docs");
const repoRoot = path.resolve(__dirname, "..");
const githubBlob = "https://github.com/bartvanderwal/brightspacosaurus/blob/main/";
function remarkRepoLinks() {
  return (tree, file) => {
    const visit = (node) => {
      if (node.type === "link" && node.url && !/^[a-z]+:|^#|^\//i.test(node.url) && file.path) {
        const [target, hash] = node.url.split("#");
        const absolute = path.resolve(path.dirname(file.path), target);
        if (!absolute.startsWith(docsDir + path.sep)) {
          node.url = githubBlob + path.relative(repoRoot, absolute).split(path.sep).join("/") +
            (hash ? `#${hash}` : "");
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

// Reorders doc items per sidebar level like the Brightspace manifest; categories keep their slots.
function sortLikeBrightspace(items, titles, positions, firstId) {
  const docs = items.filter((item) => item.type === "doc");
  const queue = sortManifestEntriesForNavigation(docs.map((item) => ({
    id: item.id,
    title: titles.get(item.id) ?? item.id,
    href: item.id,
    type: path.basename(item.id).startsWith("quiz-")
      ? "imsqti_xmlv1p2/imscc_xmlv1p3/assessment"
      : "webcontent",
    ...(positions.has(item.id) ? { position: positions.get(item.id) } : {}),
  })), { firstHref: firstId }).map((entry) => docs.find((doc) => doc.id === entry.id));
  return items.map((item) => {
    if (item.type === "doc") return queue.shift();
    if (item.type === "category") {
      return { ...item, items: sortLikeBrightspace(item.items, titles, positions, firstId) };
    }
    return item;
  });
}

module.exports = {
  title: "Demo Course Preview",
  tagline: "Preview for Brightspacosaurus demo course",
  // GitHub Pages sets these (see .github/workflows/demo-preview-pages.yml).
  url: process.env.DOCS_URL || "http://localhost:3000",
  baseUrl,
  onBrokenLinks: "throw",
  markdown: {
    format: "detect",
    preprocessor: ({ filePath, fileContent }) => {
      // Guidebook and user manual are not course material: their include
      // examples must stay literal text.
      if (path.resolve(filePath).startsWith(path.resolve(__dirname, "../docs") + path.sep)) {
        return fileContent;
      }
      const markdown = expandIncludes(
        fileContent,
        path.dirname(filePath),
        includeHost,
      );
      return path.resolve(filePath) === teacherPage.path
        ? insertVersionTable(markdown, teacherPage)
        : markdown;
    },
  },
  staticDirectories: previewStaticDir ? [previewStaticDir] : [],
  clientModules: [
    require.resolve("./src/flashcards-client.js"),
    require.resolve("./src/teacher-tabs-client.js"),
    require.resolve("remark-kroki-a11y/diagramTabs.js"),
  ],
  plugins: [["@docusaurus/plugin-content-docs", {
    id: "guidebook",
    path: "../docs",
    routeBasePath: "guidebook",
    include: [
      "software-guidebook.md",
      "user-manual.md",
      "definition-of-done.md",
      "adr/*.md",
    ],
    remarkPlugins: [remarkRepoLinks, [remarkDiagrams, diagramOptions]],
  }]],
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
          // Same sidebar_position order as the Brightspace menu.
          new Map(args.docs.filter((doc) => typeof doc.sidebarPosition === "number")
            .map((doc) => [doc.id, doc.sidebarPosition])),
          // The teacher page first in its module, as in the Brightspace menu.
          args.docs.find((doc) => path.resolve(__dirname, doc.source.replace(/^@site\//, "")) === teacherPage.path)?.id,
        ),
      beforeDefaultRemarkPlugins: [[remarkQuizPreview, quizOptions]],
      remarkPlugins: [remarkTeacherPageTabs, remarkReaderPdfLink, [remarkFlashcards, flashcardOptions], [
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
      items: [
        { to: "/lessons/", label: "Demo course", position: "left" },
        { to: "/guidebook/software-guidebook", label: "Software Guidebook", position: "left" },
        { to: "/guidebook/user-manual", label: "User manual", position: "left" },
        { href: "https://github.com/bartvanderwal/brightspacosaurus", label: "GitHub", position: "right" },
      ],
    },
    prism: { additionalLanguages: ["java", "bash"] },
  },
};
