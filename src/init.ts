/** Creates a standalone course from the demo bundled with this BSO version. */
import { basename, dirname, join, relative, resolve } from "@std/path";
import { loadDemoCourseBytes } from "./assets.ts";

/** Explicit inventory because published HTTPS packages cannot list directories. */
export const DEMO_FILES: readonly string[] = [
  "lessons/README.md",
  "lessons/features.md",
  "lessons/features/code-and-diagrams.md",
  "lessons/features/course-per-topic.md",
  "lessons/features/flashcards.md",
  "lessons/features/images/bso-features-pictogram-board.jpg",
  "lessons/features/images/slides-code.png",
  "lessons/features/images/slides-title.png",
  "lessons/features/index.md",
  "lessons/features/learning-objectives.md",
  "lessons/features/slides.md",
  "lessons/for-teachers.md",
  "lessons/images/brightspace-quiz-code-highlighting.png",
  "lessons/images/course-overview-markdown-to-package.jpg",
  "lessons/images/course-overview-team-at-screen.jpg",
  "lessons/images/for-teachers-inspect-package.jpg",
  "lessons/week-1/images/test-pyramid.svg",
  "lessons/week-1/images/week-1-authoring-code-links-flashcards.jpg",
  "lessons/week-1/images/week-1-authoring-code-links-keyboard-man.jpg",
  "lessons/week-1/images/week-1-authoring-code-links-keyboard-woman.jpg",
  "lessons/week-1/index.md",
  "lessons/week-1/lesson-1-fizzbuzz.md",
  "lessons/week-1/lesson-2-test-strategy.md",
  "lessons/week-1/lesson-3-links-includes-export.md",
  "lessons/week-1/lesson-4-core-concepts.md",
  "lessons/week-1/quiz-1-fizzbuzz.md",
  "lessons/week-1/quiz-2-test-strategy.md",
  "lessons/week-1/quiz-3-links-includes.md",
  "lessons/week-2/images/test-swatch.svg",
  "lessons/week-2/images/week-2-package-conveyor-pdf-diagram-version.jpg",
  "lessons/week-2/index.md",
  "lessons/week-2/lesson-1-diagrams-and-svg.md",
  "lessons/week-2/lesson-2-readers-and-pdf.md",
  "lessons/week-2/lesson-3-package-and-version.md",
  "lessons/week-2/lesson-4-question-types.md",
  "lessons/week-2/lesson-5-test-levels.md",
  "lessons/week-2/levels/level-end-to-end.md",
  "lessons/week-2/levels/level-integration.md",
  "lessons/week-2/levels/level-unit.md",
  "lessons/week-2/quiz-1-diagrams.md",
  "lessons/week-2/quiz-2-readers.md",
  "lessons/week-2/quiz-3-package-and-version.md",
  "lessons/week-2/quiz-4-question-types.md",
  "lessons/week-2/quiz-5-assignments.md",
  "lessons/week-2/quiz-6-heading-form.md",
  "lessons/week-2/quiz-7-code-highlighting.md",
  "partials/learning-objectives.md",
  "readers/reader-testing-basics.md",
  "slides/images/README.md",
  "slides/images/dino-whiteboard.jpg",
  "slides/images/dino-whiteboard.png",
  "slides/images/red-green-refactor.jpg",
  "slides/images/red-green-refactor.png",
  "slides/images/student-teacher.jpg",
  "slides/images/student-teacher.png",
  "slides/images/test-pyramid-platforms.jpg",
  "slides/images/test-pyramid-platforms.png",
  "slides/slides-fizzbuzz.md",
  "slides/slides-test-strategy.md",
];

interface InitOptions {
  yes?: boolean;
  ask?: (message: string) => string | null;
  log?: (message: string) => void;
}

async function conflicts(root: string, files: string[]): Promise<string[]> {
  const found = new Set<string>();
  for (const file of files) {
    let path = join(root, file);
    while (path !== root) {
      try {
        const info = await Deno.lstat(path);
        if (path === join(root, file) || !info.isDirectory || info.isSymlink) {
          found.add(relative(root, path));
        }
      } catch (error) {
        if (
          !(error instanceof Deno.errors.NotFound) &&
          !(error instanceof Deno.errors.NotADirectory)
        ) throw error;
      }
      path = dirname(path);
    }
  }
  return [...found].sort();
}

/** Lists and confirms additions before creating any files; never overwrites. */
export async function runInit(
  root: string,
  options: InitOptions = {},
): Promise<void> {
  root = resolve(root);
  const log = options.log ?? console.log;
  const configName = "brightspacosaurus.config.json";
  const files = [configName, ...DEMO_FILES];
  const existing = await conflicts(root, files);
  if (existing.length) {
    throw new Error(
      `Cannot initialize: conflicts with existing paths:\n${
        existing.map((path) => `  ${path}`).join("\n")
      }`,
    );
  }

  log(
    `Files to add in ${root}:\n${files.map((path) => `  ${path}`).join("\n")}`,
  );
  if (!options.yes) {
    const answer = (options.ask ?? prompt)(
      `Create a BSO project in ${root}? [y/N]`,
    );
    if (!/^(y|yes)$/i.test(answer?.trim() ?? "")) {
      log("Cancelled. No files created.");
      return;
    }
  }

  const config = {
    courseName: basename(root) || "Course",
    version: "0.1.0",
    sourcesDir: "lessons",
    outputDir: "build/brightspace",
    readersDir: "readers",
    slides: {
      generateForPrefix: "lesson-",
      lessons: {
        "week-2/lesson-5-test-levels.md": {
          generate: true,
          nest: ["levels/level-*.md"],
        },
      },
    },
  };
  // Load everything before writing so a missing package asset leaves no partial course.
  const contents = [
    new TextEncoder().encode(JSON.stringify(config, null, 2) + "\n"),
    ...await Promise.all(DEMO_FILES.map(loadDemoCourseBytes)),
  ];
  // Recheck after confirmation/downloads, then use exclusive creation as a final guard.
  const lateConflicts = await conflicts(root, files);
  if (lateConflicts.length) {
    throw new Error(
      `Cannot initialize: conflicts with existing paths:\n${
        lateConflicts.map((path) => `  ${path}`).join("\n")
      }`,
    );
  }
  for (const [index, file] of files.entries()) {
    const path = join(root, file);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeFile(path, contents[index], { createNew: true });
  }

  log(`Created a BSO project in ${root}.

Next steps:
  bso lint      check the course material
  bso build     generate Brightspace HTML, QTI quizzes and PDFs
  bso preview   view the course locally
  bso pack      create the .imscc for import in Brightspace

bso preview currently needs a separate Docusaurus setup:
https://github.com/bartvanderwal/brightspacosaurus#preview-docusaurus-dev-server`);
}
