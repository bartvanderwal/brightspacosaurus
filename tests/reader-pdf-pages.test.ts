import { assertEquals } from "@std/assert";
import { join, resolve } from "@std/path";
import {
  convertReaderToPdf,
  pandocAvailable,
} from "../src/reader-pdf-converter.ts";

/** Number of pages according to poppler's `pdfinfo`; null when it is not installed. */
async function pdfPages(path: string): Promise<number | null> {
  try {
    const output = await new Deno.Command("pdfinfo", {
      args: [path],
      stdout: "piped",
      stderr: "null",
    }).output();
    const pages = new TextDecoder().decode(output.stdout).match(
      /^Pages:\s+(\d+)/m,
    );
    return pages ? Number(pages[1]) : null;
  } catch {
    return null;
  }
}

async function pdfinfoAvailable(): Promise<boolean> {
  try {
    return (await new Deno.Command("pdfinfo", {
      args: ["-v"],
      stdout: "null",
      stderr: "null",
    }).output()).code === 0;
  } catch {
    return false;
  }
}

const canCountPages = pandocAvailable() && await pdfinfoAvailable();

async function convert(source: string): Promise<number | null> {
  await Deno.mkdir("build", { recursive: true });
  const outputDir = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "reader-pages-",
  });
  try {
    const result = await convertReaderToPdf({
      sourcePath: source,
      outputDir,
      repoRoot: Deno.cwd(),
      courseName: "Demo Course",
      courseVersion: "1.0",
      locale: "en",
    });
    return await pdfPages(result.outputPath);
  } finally {
    await Deno.remove(outputDir, { recursive: true });
  }
}

// Page count = cover + contents + the page with the title + one page per
// chapter: a chapter that no longer starts on a new page lowers the count (#53).
Deno.test({
  name: "reader PDF: cover, contents, title page and one page per chapter",
  ignore: !canCountPages,
  fn: async () => {
    await Deno.mkdir("build", { recursive: true });
    const dir = await Deno.makeTempDir({
      dir: resolve("build"),
      prefix: "reader-pages-src-",
    });
    try {
      const source = join(dir, "reader.md");
      await Deno.writeTextFile(
        source,
        "# Reader\n\n## 1. One\n\nText one.\n\n## 2. Two\n\nText two.\n\n## 3. Three\n\nText three.\n",
      );
      assertEquals(await convert(source), 2 + 1 + 3);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The demo reader has two diagrams, so it needs a Kroki server: run with
// KROKI_URL=http://localhost:8000. Its four chapters plus the cover, contents
// and title pages come to 8 pages (the class diagram chapter takes two).
Deno.test({
  name: "demo reader PDF has 8 pages, with every chapter on a new page",
  ignore: !canCountPages || !Deno.env.get("KROKI_URL"),
  fn: async () => {
    assertEquals(
      await convert("examples/demo-course/readers/reader-testing-basics.md"),
      8,
    );
  },
});
