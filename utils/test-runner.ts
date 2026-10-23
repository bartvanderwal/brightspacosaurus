import { join } from "@std/path";

const TEST_DIR_PREFIXES = [
  "cli-build-",
  "cleanup-check-",
  "cover-",
  "dashboard-cache-export-",
  "downloads-",
  "lint-category-metadata-",
  "lint-downloads-",
  "logo-",
  "nav-",
  "pack-",
  "preview-styles-",
  "quiz-diagrams-",
  "slides-preview-test-",
  "teacher-",
  "topic-menu-",
];

const TASKS: Record<string, string[]> = {
  all: [
    "test",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-env",
    "--allow-net=127.0.0.1",
    "tests/",
  ],
  fast: [
    "test",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-env",
    "--allow-net=127.0.0.1",
    "--ignore=tests/reader-pdf-pages.test.ts,tests/reader-pdf-converter.test.ts,tests/reader-pdf-converter-unit.test.ts,tests/include-filter.test.ts,tests/details-filter.test.ts",
    "tests/",
  ],
  pdf: [
    "test",
    "--allow-read",
    "--allow-write",
    "--allow-run",
    "--allow-env",
    "--allow-net=127.0.0.1",
    "tests/reader-pdf-converter.test.ts",
    "tests/reader-pdf-pages.test.ts",
    "tests/reader-pdf-converter-unit.test.ts",
    "tests/include-filter.test.ts",
    "tests/details-filter.test.ts",
  ],
};

export async function cleanupBuildTestDirs(buildDir: string): Promise<void> {
  try {
    for await (const entry of Deno.readDir(buildDir)) {
      if (
        entry.isDirectory &&
        TEST_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))
      ) {
        await Deno.remove(join(buildDir, entry.name), { recursive: true });
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

if (import.meta.main) {
  const task = Deno.args[0];
  const args = task ? TASKS[task] : undefined;
  if (!args) {
    console.error("Usage: deno task test[:fast|:pdf]");
    Deno.exit(2);
  }

  let exitCode = 1;
  try {
    const status = await new Deno.Command("deno", {
      args,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).spawn().status;
    exitCode = status.success ? 0 : status.code || 1;
  } finally {
    await cleanupBuildTestDirs(join(Deno.cwd(), "build"));
  }
  Deno.exit(exitCode);
}
