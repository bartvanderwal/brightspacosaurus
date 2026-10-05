/**
 * Command-line interface for Brightspacosaurus.
 *
 * Provides the `prepare`, `pack` and `preview` commands used to convert
 * Markdown course material into Brightspace-ready build output and packages.
 *
 * @module
 */

import { formatLintDiagnostic, lintCourse } from "./course-linter.ts";
import {
  basename,
  dirname,
  extname,
  fromFileUrl,
  join,
  relative,
  resolve,
} from "@std/path";
import { scanSources } from "./source-scanner.ts";
import { convertMarkdown } from "./markdown-converter.ts";
import { convertQuiz } from "./quiz-converter.ts";
import { extractAssessmentTitle } from "./quiz-converter.ts";
import { convertReaderToPdf, pandocAvailable } from "./reader-pdf-converter.ts";
import { loadPackageVersion, materializeAsset } from "./assets.ts";
import { writeTeacherDashboard } from "./teacher-dashboard.ts";
import {
  buildManifest,
  deriveReaderMenuTitle,
  sortManifestEntriesForNavigation,
} from "./manifest-builder.ts";
import { pack } from "./packer.ts";
import type { ManifestEntry, ResolvedConfig } from "./types.ts";
import {
  EXAMPLE_CONFIG,
  findConfigFile,
  loadConfig,
  resolveConfig,
  resolveFromCliOnly,
} from "./config-loader.ts";

/**
 * Decodes HTML entities back to plain text.
 * Needed because titles are extracted from generated HTML (where rehype has
 * already escaped correctly). Without decoding, escapeXml() in the ManifestBuilder
 * would double-escape the entities (e.g. &amp; → &amp;amp;).
 */
export function decodeHtmlEntities(text: string): string {
  return text
    // Numeric entities first: hex (&#x26;) and decimal (&#38;)
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_m, hex) => String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Named entities next. &amp; last so we don't get a double decode
    // (e.g. &amp;lt; → &lt; and not → <).
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const USAGE_BODY = `Usage: brightspacosaurus <command> [options]

Commands:
  prepare   Convert Markdown source files to HTML and quiz Markdown to QTI
  pack      Package the build directory into a .imscc archive
  preview   Start the Docusaurus dev server (requires docusaurusDir in config)
  lint      Check BSO-specific Markdown, includes, diagrams and quiz answers

Options:
  --config <path>    Path to the configuration file (default: brightspacosaurus.config.json in cwd)
  --sources <dir>    Source directory for lesson and quiz Markdown (overrides config.sourcesDir)
  --output <path>    Build directory that also receives the .imscc (overrides config.outputDir)
  --readers-only     Generate reader and instructor PDFs only (skip HTML/QTI conversion)
  --skip-readers     Skip all PDF generation with pandoc (readers, instructor and user manual);
                     pre-built PDFs are still copied. Faster local builds and tests
  --version, -v      Show version number
  --help, -h         Show this help
`;

/** Builds the full usage text with a version header line. */
export function buildUsage(version: string): string {
  const header =
    `Brightspacosaurus v${version} — Markdown course material → Brightspace Common Cartridge (.imscc)\n\n`;
  return header + USAGE_BODY;
}

/** Prints usage to the given channel ("stdout" for help, "stderr" for errors). */
function printUsage(
  version: string,
  channel: "stdout" | "stderr" = "stderr",
): void {
  const text = buildUsage(version);
  if (channel === "stdout") {
    console.log(text);
  } else {
    console.error(text);
  }
}

/** Subcommands the CLI accepts as first argument. */
const COMMANDS = ["prepare", "pack", "preview", "lint"];

/**
 * Returns the error text for an unknown subcommand, or null when the first
 * argument is a known command, an option or absent.
 */
export function unknownCommandMessage(args: string[]): string | null {
  const command = args[0];
  if (command === undefined || command.startsWith("-")) return null;
  if (COMMANDS.includes(command)) return null;
  return `Unknown command '${command}'.\nRun 'bso --help' for available commands.`;
}

/** Parses Brightspacosaurus CLI arguments for the supported subcommands. */
export function parseArgs(
  args: string[],
): {
  command: string;
  sources: string;
  readersOnly: boolean;
  skipReaders: boolean;
  output: string;
  config: string;
} | null {
  if (args.length === 0) return null;

  const command = args[0];
  if (!COMMANDS.includes(command)) {
    return null;
  }

  let sources = "";
  let readersOnly = false;
  let skipReaders = false;
  let output = "";
  let config = "";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--sources" && i + 1 < args.length) {
      sources = args[++i];
    } else if (args[i] === "--readers-only") {
      readersOnly = true;
    } else if (args[i] === "--skip-readers") {
      skipReaders = true;
    } else if (args[i] === "--name" && i + 1 < args.length) {
      output = args[++i]; // backwards compat
    } else if (args[i] === "--output" && i + 1 < args.length) {
      output = args[++i];
    } else if (args[i] === "--config" && i + 1 < args.length) {
      config = args[++i];
    }
  }

  return { command, sources, readersOnly, skipReaders, output, config };
}

/** Runs the `prepare` command using an already resolved configuration. */
/**
 * URL of the Voortgangsverkenner relative to the teacher page's HTML, or null
 * when `teacherDashboard` is not configured (#37).
 */
function teacherDashboardSrc(config: ResolvedConfig, teacherPagePath: string): string | null {
  if (!config.teacherDashboard) return null;
  const pageDir = dirname(relative(config.sourcesDir, teacherPagePath));
  return relative(pageDir, join("docenten", "voortgangsverkenner.html")).split(/[\\/]/).join("/");
}

/** Options for `runPrepare` that do not come from the configuration file. */
export interface PrepareOptions {
  /** Skip all PDF generation with pandoc; pre-built PDFs are still copied. */
  skipReaders?: boolean;
}

export async function runPrepare(
  config: ResolvedConfig,
  readersOnly: boolean,
  options: PrepareOptions = {},
): Promise<void> {
  const skipReaders = options.skipReaders ?? false;
  const packageVersion = await loadPackageVersion();
  const repoRoot = config.repoRoot;
  const buildDir = config.outputDir;
  const contentOutputDir = join(buildDir, "content");
  const quizOutputDir = join(buildDir, "quiz");
  const readersOutputDir = join(buildDir, "readers");

  if (!readersOnly) {
    await Deno.remove(contentOutputDir, { recursive: true }).catch(() =>
      undefined
    );
    await Deno.remove(quizOutputDir, { recursive: true }).catch(() =>
      undefined
    );
    await Deno.remove(join(buildDir, "imsmanifest.xml")).catch(() => undefined);
  }
  await Deno.remove(readersOutputDir, { recursive: true }).catch(() =>
    undefined
  );

  console.log(
    `Scanning source directory: ${
      relative(repoRoot, config.sourcesDir) || config.sourcesDir
    }`,
  );
  const scanResult = await scanSources({
    sourcesDir: config.sourcesDir,
    repoRoot,
  });

  // Reader scan from config.readersDir (null → skip without notice)
  let readerFiles: string[] = [];
  let pdfFiles: string[] = [];
  if (config.readersDir) {
    try {
      await Deno.stat(config.readersDir);
      console.log(
        `Scanning readers directory: ${relative(repoRoot, config.readersDir)}`,
      );
      const readersScan = await scanSources({
        sourcesDir: config.readersDir,
        repoRoot,
      });
      readerFiles = readersScan.readerFiles;
      pdfFiles = readersScan.pdfFiles;
    } catch {
      // Readers directory does not exist — no readers
    }
  }

  console.log(
    `Found: ${scanResult.markdownFiles.length} lesson files, ${scanResult.quizFiles.length} quiz files, ${readerFiles.length} reader files`,
  );

  if (!readersOnly) {
    // Phase 1: Convert lesson Markdown to HTML
    // Keep quiz-only courses packable even when no lesson creates this directory.
    await Deno.mkdir(contentOutputDir, { recursive: true });
    const teacherPage = config.teacherPage;
    if (
      teacherPage?.explicit &&
      !scanResult.markdownFiles.includes(teacherPage.path)
    ) {
      const err = new Error(
        `Teacher page not found: ${
          relative(repoRoot, teacherPage.path)
        }. Create it or correct 'teacherPage' in brightspacosaurus.config.json.`,
      );
      (err as Error & { exitCode: number }).exitCode = 3;
      throw err;
    }
    for (const mdFile of scanResult.markdownFiles) {
      const result = await convertMarkdown({
        sourcePath: mdFile,
        outputDir: contentOutputDir,
        repoRoot,
        baseDir: config.sourcesDir,
        version: config.version,
        packageVersion,
        customCssPath: config.customCss ?? undefined,
        diagrams: config.diagrams,
        flashcards: config.flashcards,
        teacherPageVersions: mdFile === teacherPage?.path
          ? {
            courseName: config.courseName,
            courseVersion: config.version,
            bsoVersion: packageVersion,
          }
          : undefined,
        teacherDashboardSrc: mdFile === teacherPage?.path
          ? teacherDashboardSrc(config, mdFile)
          : undefined,
      });
      const relPath = relative(contentOutputDir, result.outputPath);
      console.log(`  ✓ ${relPath}`);
    }

    // Phase 1b: Convert README.md from the sourcesDir parent to HTML
    // (if it exists, place it under the first week directory for manifest grouping)
    const sourcesParent = dirname(config.sourcesDir);
    const parentHtmlFiles = ["README.md"];
    for (const parentFile of parentHtmlFiles) {
      const parentFilePath = join(sourcesParent, parentFile);
      try {
        await Deno.stat(parentFilePath);
        const week1OutputDir = join(contentOutputDir, "week-1");
        await Deno.mkdir(week1OutputDir, { recursive: true });
        const result = await convertMarkdown({
          sourcePath: parentFilePath,
          outputDir: week1OutputDir,
          repoRoot,
          baseDir: dirname(parentFilePath),
          version: config.version,
          packageVersion,
          customCssPath: config.customCss ?? undefined,
          diagrams: config.diagrams,
          flashcards: config.flashcards,
        });
        const relPath = relative(contentOutputDir, result.outputPath);
        console.log(`  ✓ ${relPath} (${parentFile})`);
      } catch {
        // File not found — skip
      }
    }

    // Phase 2: Convert quiz Markdown to QTI XML
    for (const quizFile of scanResult.quizFiles) {
      const result = await convertQuiz({
        sourcePath: quizFile,
        outputDir: quizOutputDir,
        repoRoot,
        sourcesDir: config.sourcesDir,
        maxAttempts: config.quiz.maxAttempts,
        shuffleAnswers: config.quiz.shuffleAnswers,
      });
      const relPath = relative(quizOutputDir, result.outputPath);
      console.log(`  ✓ quiz/${relPath}`);
    }

    // Phase 2b: Teacher Dashboard (Voortgangsverkenner) if configured
    if (config.teacherDashboard) {
      await writeTeacherDashboard(join(contentOutputDir, "docenten"), config.teacherDashboard);
      console.log(`  ✓ content/docenten/voortgangsverkenner.html`);
    }
  }

  // Phase 3: Convert reader Markdown to PDF via pandoc
  if (skipReaders && readerFiles.length > 0) {
    console.log(`Skipping ${readerFiles.length} reader PDF(s) (--skip-readers).`);
  } else if (readerFiles.length > 0) {
    if (!pandocAvailable()) {
      console.warn(
        "⚠ pandoc not found — reader PDF conversion skipped. Install pandoc: https://pandoc.org/installing.html",
      );
    } else {
      console.log(`Converting ${readerFiles.length} reader(s) to PDF...`);
      let succeeded = 0;
      let failed = 0;
      const failedFiles: string[] = [];

      for (const readerFile of readerFiles) {
        try {
          const result = await convertReaderToPdf({
            sourcePath: readerFile,
            outputDir: readersOutputDir,
            repoRoot,
            courseName: config.courseName,
            courseVersion: config.version,
            coverLogoPath: config.readerCoverLogo ?? undefined,
            locale: config.diagrams.locale,
            chapterNewPage: config.readerChapterNewPage ?? true,
          });
          console.log(`  ✓ readers/${result.filename}`);
          succeeded++;
        } catch (e) {
          failed++;
          const relPath = relative(repoRoot, readerFile);
          failedFiles.push(relPath);
          console.error(`  ✗ ${relPath}: ${(e as Error).message}`);
        }
      }

      // Summary
      console.log(
        `Readers: ${succeeded} of ${readerFiles.length} converted${
          failed > 0 ? `, ${failed} failed` : ""
        }`,
      );

      if (failed > 0) {
        const error = new Error(
          `Reader PDF conversion failed for: ${failedFiles.join(", ")}`,
        ) as Error & { exitCode?: number };
        error.exitCode = 3;
        throw error;
      }
    }
  }

  // Phase 3b: Copy pre-generated PDFs directly (no pandoc needed)
  if (pdfFiles.length > 0) {
    await Deno.mkdir(readersOutputDir, { recursive: true });
    for (const pdfFile of pdfFiles) {
      const filename = basename(pdfFile);
      const destPath = join(readersOutputDir, filename);
      await Deno.copyFile(pdfFile, destPath);
      console.log(`  ✓ readers/${filename} (pre-built)`);
    }
  }

  // Phase 4: Generate instructor manual as a combined PDF (null → skip without notice)
  if (config.teacherManual && !skipReaders && pandocAvailable()) {
    const dhConfig = config.teacherManual;
    const teacherOutputDir = dhConfig.outputDir;
    await Deno.remove(teacherOutputDir, { recursive: true }).catch(() =>
      undefined
    );

    // Check that all source files exist
    const existingFiles: string[] = [];
    for (const f of dhConfig.inputFiles) {
      try {
        await Deno.stat(f);
        existingFiles.push(f);
      } catch {
        console.warn(`  ⚠ Instructor file not found: ${relative(repoRoot, f)}`);
      }
    }

    if (existingFiles.length > 0) {
      await Deno.mkdir(teacherOutputDir, { recursive: true });
      const outputFile = join(teacherOutputDir, dhConfig.outputName);
      const today = new Date().toISOString().slice(0, 10);
      // Resource path: directory of the first source file
      const resourcePath = dirname(existingFiles[0]);

      console.log(
        `Generating instructor manual PDF (${existingFiles.length} source files)...`,
      );
      // Materialize BSO assets to temporary files (works locally and from JSR)
      const headerPath = await materializeAsset("reader-header.tex");
      const includeFilterPath = await materializeAsset("include-filter.lua");

      const cmd = new Deno.Command("pandoc", {
        args: [
          ...existingFiles,
          "-o",
          outputFile,
          `--resource-path=${resourcePath}`,
          "--pdf-engine=xelatex",
          `-V`,
          "geometry:margin=2.5cm",
          "-V",
          "lang=nl",
          "-V",
          "documentclass=report",
          `-V`,
          `title=Docentenhandleiding ${config.courseName}`,
          "-V",
          `date=${today}`,
          `--include-in-header=${headerPath}`,
          `--lua-filter=${includeFilterPath}`,
          "--syntax-highlighting=tango",
          "--toc",
          "--toc-depth=2",
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const pandocOutput = await cmd.output();
      if (pandocOutput.success) {
        console.log(`  ✓ ${relative(buildDir, outputFile)}`);
      } else {
        const stderr = new TextDecoder().decode(pandocOutput.stderr);
        console.warn(
          `  ⚠ Instructor manual PDF failed (non-blocking): ${
            stderr.slice(0, 200)
          }`,
        );
        // Non-blocking: the instructor manual is optional
        await Deno.remove(outputFile).catch(() => undefined);
      }
    }
  }

  // Phase 4b: Brightspacosaurus user manual as a separate PDF.
  // This section reads the user manual source from docs/ (not published to JSR)
  // and is therefore only meaningful when running from local source. If the
  // user manual source cannot be found as a local file (e.g. from the JSR cache),
  // we silently skip this phase.
  if (!skipReaders && pandocAvailable()) {
    const teacherOutputDir = config.teacherManual?.outputDir ??
      join(buildDir, "docenten");

    // Resolve the docs directory locally; from JSR there is no local docs/ path → skip.
    let bsoDocsDir: string | undefined;
    let bsoSource: string | undefined;
    try {
      const docsUrl = import.meta.resolve("../docs/user-manual.md");
      if (!docsUrl.startsWith("file:")) {
        throw new Error("docs not available locally (JSR)");
      }
      bsoSource = fromFileUrl(docsUrl);
      bsoDocsDir = dirname(bsoSource);
      // Confirm that the source actually exists
      await Deno.stat(bsoSource);
    } catch {
      bsoDocsDir = undefined;
      bsoSource = undefined;
    }

    if (bsoDocsDir && bsoSource) {
      try {
        // Make sure docs/images/ exists (copy PNG assets if needed)
        const bsoImagesDir = join(bsoDocsDir, "images");
        try {
          await Deno.stat(bsoImagesDir);
        } catch {
          await Deno.mkdir(bsoImagesDir, { recursive: true });
          // PNG assets live next to the docs directory under assets/; materializing is not
          // possible for binary files, so we only copy what exists locally.
          const bsoAssetsDir = resolve(bsoDocsDir, "..", "assets");
          try {
            for await (const entry of Deno.readDir(bsoAssetsDir)) {
              if (entry.isFile && entry.name.endsWith(".png")) {
                await Deno.copyFile(
                  join(bsoAssetsDir, entry.name),
                  join(bsoImagesDir, entry.name),
                );
              }
            }
          } catch {
            // assets directory not available locally — continue without images
          }
        }

        await Deno.mkdir(teacherOutputDir, { recursive: true });
        const bsoOutput = join(teacherOutputDir, "user-manual.pdf");
        console.log("Generating Brightspacosaurus user manual PDF...");
        const headerPath = await materializeAsset("reader-header.tex");
        const includeFilterPath = await materializeAsset("include-filter.lua");
        const bsoCmd = new Deno.Command("pandoc", {
          args: [
            bsoSource,
            "-o",
            bsoOutput,
            `--resource-path=${bsoDocsDir}`,
            "--pdf-engine=xelatex",
            "-V",
            "geometry:margin=2.5cm",
            "-V",
            "lang=nl",
            `--include-in-header=${headerPath}`,
            `--lua-filter=${includeFilterPath}`,
            "--syntax-highlighting=tango",
            "--toc",
            "--toc-depth=2",
            `-V`,
            `date=${new Date().toISOString().slice(0, 10)}`,
          ],
          // Raw LaTeX \includegraphics on the cover page resolves against the cwd, not --resource-path.
          cwd: bsoDocsDir,
          stdout: "piped",
          stderr: "piped",
        });
        const bsoResult = await bsoCmd.output();
        if (bsoResult.success) {
          console.log(`  ✓ ${relative(buildDir, bsoOutput)}`);
        } else {
          const bsoStderr = new TextDecoder().decode(bsoResult.stderr);
          console.warn(
            `  ⚠ Brightspacosaurus user manual PDF failed (non-blocking):`,
          );
          console.warn(`    ${bsoStderr.trim()}`);
          await Deno.remove(bsoOutput).catch(() => undefined);
        }
      } catch {
        // Brightspacosaurus user manual not found or error — skip
      }
    }
  }

  console.log(`Prepare complete.`);
}

/** Runs the `pack` command using an already resolved configuration. */
export async function runPack(config: ResolvedConfig): Promise<void> {
  const repoRoot = config.repoRoot;
  const buildDir = config.outputDir;
  // Course version, not BSO version: it identifies the imported content (#42).
  const outputPath = join(buildDir, `${config.name}.v${config.version}.imscc`);

  // Run prepare first if build/content/ does not exist
  try {
    await Deno.stat(join(buildDir, "content"));
  } catch {
    console.log(
      "build/brightspace/content/ not found, running prepare first...",
    );
    await runPrepare(config, false);
  }

  // Generate imsmanifest.xml
  console.log("Generating imsmanifest.xml...");
  const entries: ManifestEntry[] = [];
  const contentDir = join(buildDir, "content");

  async function scanHtml(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory) {
        await scanHtml(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".html")) {
        const relPath = "content/" + relative(contentDir, fullPath);
        const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");

        // Look for image references in the HTML for manifest dependencies
        const html = await Deno.readTextFile(fullPath);

        // Use the H1 from the HTML as title (falls back to the file name).
        // decodeHtmlEntities prevents double encoding: rehype already escapes to &amp; etc.,
        // and escapeXml() in buildManifest does that again if we don't decode first.
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = h1Match
          ? decodeHtmlEntities(h1Match[1].trim())
          : basename(fullPath, extname(fullPath));

        const assetRegex = /(?:src|href)="([^"]+\.(?:png|jpg|jpeg|gif|svg|webp|css|js|woff2))"/gi;
        const dependencies: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = assetRegex.exec(html)) !== null) {
          const assetSrc = match[1];
          if (!assetSrc.startsWith("http://") && !assetSrc.startsWith("https://") && !assetSrc.startsWith("#")) {
            // Resolve relative path with respect to the HTML file
            const htmlDir = dirname(fullPath);
            const assetAbs = resolve(htmlDir, assetSrc);
            const assetRel = "content/" + relative(contentDir, assetAbs);
            dependencies.push(assetRel);
          }
        }

        const positionMatch = html.match(
          /<meta name="bso-sidebar-position" content="(-?\d+(?:\.\d+)?)">/,
        );
        entries.push({
          id,
          title,
          href: relPath,
          type: "webcontent",
          dependencies,
          ...(positionMatch ? { position: Number(positionMatch[1]) } : {}),
        });
      }
    }
  }
  await scanHtml(contentDir);

  // Scan QTI/quiz files in build
  const quizDir = join(buildDir, "quiz");
  try {
    await Deno.stat(quizDir);
    const scanQuiz = async (dir: string): Promise<void> => {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory) {
          await scanQuiz(fullPath);
        } else if (entry.isFile && entry.name.endsWith(".xml")) {
          const relPath = "quiz/" + relative(quizDir, fullPath);
          const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");
          const xml = await Deno.readTextFile(fullPath);
          const fallbackTitle = basename(fullPath, extname(fullPath)).replace(
            /^qti-/,
            "",
          );
          const title = extractAssessmentTitle(xml, fallbackTitle);
          entries.push({
            id,
            title,
            href: relPath,
            type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
          });
        }
      }
    };
    await scanQuiz(quizDir);
  } catch {
    // No quiz directory
  }

  // Scan PDF readers in build/brightspace/readers/
  const readersDir = join(buildDir, "readers");
  try {
    await Deno.stat(readersDir);
    for await (const entry of Deno.readDir(readersDir)) {
      if (entry.isFile && entry.name.endsWith(".pdf")) {
        const relPath = "readers/" + entry.name;
        const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");
        const title = deriveReaderMenuTitle(entry.name);
        entries.push({ id, title, href: relPath, type: "webcontent" });
      }
    }
  } catch {
    // No readers directory — PDF conversion is optional
  }

  // Instructor PDFs are NOT included in the .imscc (security risk: answers visible to students).
  // They do remain as standalone files in build/brightspace/docenten/ for internal use.
  // There is no instructor landing page: GitLab is the source of truth for instructor material.

  // The teacher page always comes first in its module (#37).
  const teacherPageHref = config.teacherPage
    ? "content/" +
      relative(config.sourcesDir, config.teacherPage.path).replace(/\.md$/, ".html")
        .split(/[\\/]/).join("/")
    : undefined;
  const sortedEntries = sortManifestEntriesForNavigation(entries, {
    firstHref: teacherPageHref,
  });

  const manifestXml = buildManifest(
    config.courseName,
    sortedEntries,
    config.readersModule,
    { module: config.teacherDashboard?.module ?? null, teacherPageHref },
  );
  await Deno.writeTextFile(join(buildDir, "imsmanifest.xml"), manifestXml);
  console.log("  ✓ imsmanifest.xml");

  // Pack
  console.log("Packaging into .imscc...");
  await pack({ sourceDir: buildDir, outputPath });
  console.log(`  ✓ ${relative(repoRoot, outputPath)}`);
  console.log("Pack complete.");
}

/** Runs the `preview` command using an already resolved configuration. */
export async function runPreview(config: ResolvedConfig): Promise<void> {
  const repoRoot = config.repoRoot;

  if (!config.docusaurusDir) {
    const err = new Error(
      "preview requires a 'docusaurusDir' in brightspacosaurus.config.json. " +
        'Add a "docusaurusDir" field pointing to your Docusaurus directory (relative to Repo_Root).',
    ) as Error & { exitCode?: number };
    err.exitCode = 1;
    throw err;
  }

  try {
    const stat = await Deno.stat(config.docusaurusDir);
    if (!stat.isDirectory) {
      throw new Error("not a directory");
    }
  } catch {
    const err = new Error(
      `Docusaurus directory not found: ${config.docusaurusDir}`,
    ) as Error & { exitCode?: number };
    err.exitCode = 1;
    throw err;
  }

  console.log(
    `Starting Docusaurus dev server in ${
      relative(repoRoot, config.docusaurusDir)
    }...`,
  );

  // Dev/prod parity: the preview serves the same dashboard files as the
  // export, from a static directory next to the build directory, so `pack`
  // never includes them (#37).
  // Reader PDFs from an earlier `prepare` are served too, so reader pages can
  // link to the PDF as in Brightspace.
  const staticDir = join(dirname(config.outputDir), "preview-static");
  let previewStaticDir = "";
  if (config.teacherDashboard) {
    previewStaticDir = staticDir;
    await writeTeacherDashboard(join(staticDir, "docenten"), config.teacherDashboard);
  }
  try {
    for await (const entry of Deno.readDir(join(config.outputDir, "readers"))) {
      if (!entry.isFile || !entry.name.endsWith(".pdf")) continue;
      await Deno.mkdir(join(staticDir, "readers"), { recursive: true });
      await Deno.copyFile(join(config.outputDir, "readers", entry.name), join(staticDir, "readers", entry.name));
      previewStaticDir = staticDir;
    }
  } catch {
    // No reader PDFs built yet: reader pages show only the web version.
  }

  const cmd = new Deno.Command("npm", {
    args: ["start"],
    env: {
      BSO_PREVIEW_STATIC_DIR: previewStaticDir,
      BSO_PREVIEW_QUIZ_CONFIG: JSON.stringify(config.quiz),
      BSO_PREVIEW_FLASHCARDS_CONFIG: JSON.stringify(config.flashcards ?? {}),
      BSO_PREVIEW_TEACHER_PAGE: JSON.stringify({
        path: config.teacherPage?.path ?? null,
        courseName: config.courseName,
        courseVersion: config.version,
        bsoVersion: await loadPackageVersion(),
        dashboardSrc: config.teacherDashboard ? "/docenten/voortgangsverkenner.html" : null,
      }),
    },
    cwd: config.docusaurusDir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const child = cmd.spawn();
  const status = await child.status;
  if (!status.success) {
    const err = new Error(
      `Docusaurus dev server exited with code ${status.code}`,
    ) as Error & { exitCode?: number };
    err.exitCode = status.code || 1;
    throw err;
  }
}

/** Report authoring diagnostics without generating course output. */
export async function runLint(config: ResolvedConfig): Promise<void> {
  const result = await lintCourse(config);
  for (const diagnostic of result.diagnostics) {
    console.error(formatLintDiagnostic(diagnostic, config.repoRoot));
  }
  const errors =
    result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")
      .length;
  const warnings = result.diagnostics.length - errors;
  console.log(
    `Checked ${result.filesChecked} Markdown files: ${errors} errors, ${warnings} warnings.`,
  );
  if (errors) {
    throw Object.assign(
      new Error(
        "Course lint failed. Fix the reported errors before exporting.",
      ),
      { exitCode: 1 },
    );
  }
}

// --- Main ---

async function main(): Promise<void> {
  const args = Deno.args;
  const version = await loadPackageVersion();

  // Unknown command → explicit error plus a pointer to --help, exit 1.
  // Checked first, so --help or --version never hide the error.
  const unknown = unknownCommandMessage(args);
  if (unknown) {
    console.error(unknown);
    Deno.exit(1);
  }

  // Version and help intents are handled before command parsing.
  // --version / -v → version to stdout, exit 0.
  if (args.includes("--version") || args.includes("-v")) {
    console.log(`brightspacosaurus v${version}`);
    Deno.exit(0);
  }
  // --help / -h → usage to stdout, exit 0.
  if (args.includes("--help") || args.includes("-h")) {
    printUsage(version, "stdout");
    Deno.exit(0);
  }

  const parsed = parseArgs(args);

  if (!parsed) {
    // No arguments or an invalid command → usage to stderr, exit 1.
    printUsage(version, "stderr");
    Deno.exit(1);
  }

  // repoRoot = the directory from which deno run is invoked (working directory)
  // This makes brightspacosaurus location-independent: the tool can live anywhere.
  const repoRoot = Deno.cwd();

  // Load configuration via the config-loading flow:
  // findConfigFile → loadConfig → resolveConfig
  // With a fallback to CLI-only when there is no config file but --sources is given.
  let resolvedConfig: ResolvedConfig;

  try {
    const configPath = await findConfigFile(
      repoRoot,
      parsed.config || undefined,
    );

    if (configPath) {
      // Config file found: load, validate and merge with CLI overrides
      const config = await loadConfig(configPath);
      resolvedConfig = resolveConfig(
        config,
        {
          sources: parsed.sources || undefined,
          output: parsed.output || undefined,
          readersOnly: parsed.readersOnly,
          config: parsed.config || undefined,
        },
        repoRoot,
      );
    } else if (parsed.sources) {
      // No config file, but --sources is given: fall back to CLI-only
      resolvedConfig = resolveFromCliOnly(
        {
          sources: parsed.sources,
          output: parsed.output || undefined,
          readersOnly: parsed.readersOnly,
        },
        repoRoot,
      );
    } else {
      // No config file and no --sources: show error message + example
      console.error(
        "Error: no brightspacosaurus.config.json found and no --sources argument.",
      );
      console.error("Create a configuration file. Example:\n");
      console.error(EXAMPLE_CONFIG);
      Deno.exit(1);
    }
  } catch (e) {
    const error = e as Error & { exitCode?: number };
    console.error(`Error: ${error.message}`);
    Deno.exit(error.exitCode ?? 1);
  }

  try {
    if (parsed.command === "prepare") {
      await runPrepare(resolvedConfig, parsed.readersOnly, { skipReaders: parsed.skipReaders });
    } else if (parsed.command === "pack") {
      await runPack(resolvedConfig);
    } else if (parsed.command === "preview") {
      await runPreview(resolvedConfig);
    } else if (parsed.command === "lint") {
      await runLint(resolvedConfig);
    }
  } catch (e) {
    const error = e as Error & { exitCode?: number };
    console.error(`Error: ${error.message}`);
    Deno.exit(error.exitCode ?? 1);
  }
}

if (import.meta.main) {
  main();
}
