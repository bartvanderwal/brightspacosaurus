/**
 * Brightspacosaurus CLI — entry point.
 * Subcommands: prepare, pack
 * Requirements: 6.2, 6.4, 6.5
 */

import { resolve, join, basename, extname, relative, dirname, fromFileUrl } from "@std/path";
import { scanSources } from "./source-scanner.ts";
import { convertMarkdown } from "./markdown-converter.ts";
import { convertQuiz } from "./quiz-converter.ts";
import { convertReaderToPdf, pandocAvailable } from "./reader-pdf-converter.ts";
import { materializeAsset, loadPackageVersion } from "./assets.ts";
import { buildManifest } from "./manifest-builder.ts";
import { pack } from "./packer.ts";
import { ManifestEntry, ResolvedConfig } from "./types.ts";
import {
  findConfigFile,
  loadConfig,
  resolveConfig,
  resolveFromCliOnly,
  EXAMPLE_CONFIG,
} from "./config-loader.ts";

/**
 * Decodes HTML entities back to plain text.
 * Needed because titles are extracted from generated HTML (where rehype has
 * already escaped correctly). Without decoding, escapeXml() in the ManifestBuilder
 * would double-escape the entities (e.g. &amp; → &amp;amp;).
 */
function decodeHtmlEntities(text: string): string {
  return text
    // Numeric entities first: hex (&#x26;) and decimal (&#38;)
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
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

Options:
  --config <path>    Path to the configuration file (default: brightspacosaurus.config.json in cwd)
  --sources <dir>    Source directory for lesson and quiz Markdown (overrides config.sourcesDir)
  --output <path>    Output path or name for .imscc (overrides config.outputDir/name)
  --readers-only     Generate reader and instructor PDFs only (skip HTML/QTI conversion)
  --version, -v      Show version number
  --help, -h         Show this help
`;

/** Builds the full usage text with a version header line. */
function buildUsage(version: string): string {
  const header =
    `Brightspacosaurus v${version} — Markdown course material → Brightspace Common Cartridge (.imscc)\n\n`;
  return header + USAGE_BODY;
}

/** Prints usage to the given channel ("stdout" for help, "stderr" for errors). */
function printUsage(version: string, channel: "stdout" | "stderr" = "stderr"): void {
  const text = buildUsage(version);
  if (channel === "stdout") {
    console.log(text);
  } else {
    console.error(text);
  }
}

function parseArgs(args: string[]): { command: string; sources: string; readersOnly: boolean; output: string; config: string } | null {
  if (args.length === 0) return null;

  const command = args[0];
  if (command !== "prepare" && command !== "pack") return null;

  let sources = "";
  let readersOnly = false;
  let output = "";
  let config = "";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--sources" && i + 1 < args.length) {
      sources = args[++i];
    } else if (args[i] === "--readers-only") {
      readersOnly = true;
    } else if (args[i] === "--name" && i + 1 < args.length) {
      output = args[++i]; // backwards compat
    } else if (args[i] === "--output" && i + 1 < args.length) {
      output = args[++i];
    } else if (args[i] === "--config" && i + 1 < args.length) {
      config = args[++i];
    }
  }

  return { command, sources, readersOnly, output, config };
}



async function runPrepare(config: ResolvedConfig, readersOnly: boolean): Promise<void> {
  const repoRoot = config.repoRoot;
  const buildDir = config.outputDir;
  const contentOutputDir = join(buildDir, "content");
  const quizOutputDir = join(buildDir, "quiz");
  const readersOutputDir = join(buildDir, "readers");

  if (!readersOnly) {
    await Deno.remove(contentOutputDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(quizOutputDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(join(buildDir, "imsmanifest.xml")).catch(() => undefined);
  }
  await Deno.remove(readersOutputDir, { recursive: true }).catch(() => undefined);

  console.log(`Scanning source directory: ${relative(repoRoot, config.sourcesDir) || config.sourcesDir}`);
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
      console.log(`Scanning readers directory: ${relative(repoRoot, config.readersDir)}`);
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

  console.log(`Found: ${scanResult.markdownFiles.length} lesson files, ${scanResult.quizFiles.length} quiz files, ${readerFiles.length} reader files`);

  if (!readersOnly) {
    // Phase 1: Convert lesson Markdown to HTML
    for (const mdFile of scanResult.markdownFiles) {
      const result = await convertMarkdown({
        sourcePath: mdFile,
        outputDir: contentOutputDir,
        repoRoot,
        baseDir: config.sourcesDir,
        version: config.version,
        customCssPath: config.customCss ?? undefined,
      });
      const relPath = relative(contentOutputDir, result.outputPath);
      console.log(`  ✓ ${relPath}`);
    }

    // Phase 1b: Convert README.md and other standalone HTML pages from the sourcesDir parent to HTML
    // (if it exists, place it under the first week directory for manifest grouping)
    const sourcesParent = dirname(config.sourcesDir);
    const parentHtmlFiles = ["README.md", "voor-docenten.md"];
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
          customCssPath: config.customCss ?? undefined,
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
      });
      const relPath = relative(quizOutputDir, result.outputPath);
      console.log(`  ✓ quiz/${relPath}`);
    }
  }

  // Phase 3: Convert reader Markdown to PDF via pandoc
  if (readerFiles.length > 0) {
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
        `Readers: ${succeeded} of ${readerFiles.length} converted${failed > 0 ? `, ${failed} failed` : ""}`,
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
  if (config.docentenHandleiding && pandocAvailable()) {
    const dhConfig = config.docentenHandleiding;
    const docentenOutputDir = dhConfig.outputDir;
    await Deno.remove(docentenOutputDir, { recursive: true }).catch(() => undefined);

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
      await Deno.mkdir(docentenOutputDir, { recursive: true });
      const outputFile = join(docentenOutputDir, dhConfig.outputName);
      const today = new Date().toISOString().slice(0, 10);
      // Resource path: directory of the first source file
      const resourcePath = dirname(existingFiles[0]);

      console.log(`Generating instructor manual PDF (${existingFiles.length} source files)...`);
      // Materialize BSS assets to temporary files (works locally and from JSR)
      const headerPath = await materializeAsset("reader-header.tex");
      const includeFilterPath = await materializeAsset("include-filter.lua");

      const cmd = new Deno.Command("pandoc", {
        args: [
          ...existingFiles,
          "-o", outputFile,
          `--resource-path=${resourcePath}`,
          "--pdf-engine=xelatex",
          `-V`, "geometry:margin=2.5cm",
          "-V", "lang=nl",
          "-V", "documentclass=report",
          `-V`, `title=Docentenhandleiding ${config.courseName}`,
          "-V", `date=${today}`,
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
        console.warn(`  ⚠ Instructor manual PDF failed (non-blocking): ${stderr.slice(0, 200)}`);
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
  if (pandocAvailable()) {
    const docentenOutputDir = config.docentenHandleiding?.outputDir ?? join(buildDir, "docenten");

    // Resolve the docs directory locally; from JSR there is no local docs/ path → skip.
    let bssDocsDir: string | undefined;
    let bssSource: string | undefined;
    try {
      const docsUrl = import.meta.resolve("../docs/user-manual.md");
      if (!docsUrl.startsWith("file:")) {
        throw new Error("docs not available locally (JSR)");
      }
      bssSource = fromFileUrl(docsUrl);
      bssDocsDir = dirname(bssSource);
      // Confirm that the source actually exists
      await Deno.stat(bssSource);
    } catch {
      bssDocsDir = undefined;
      bssSource = undefined;
    }

    if (bssDocsDir && bssSource) {
      try {
        // Make sure docs/images/ exists (copy PNG assets if needed)
        const bssImagesDir = join(bssDocsDir, "images");
        try { await Deno.stat(bssImagesDir); } catch {
          await Deno.mkdir(bssImagesDir, { recursive: true });
          // PNG assets live next to the docs directory under assets/; materializing is not
          // possible for binary files, so we only copy what exists locally.
          const bssAssetsDir = resolve(bssDocsDir, "..", "assets");
          try {
            for await (const entry of Deno.readDir(bssAssetsDir)) {
              if (entry.isFile && entry.name.endsWith(".png")) {
                await Deno.copyFile(join(bssAssetsDir, entry.name), join(bssImagesDir, entry.name));
              }
            }
          } catch {
            // assets directory not available locally — continue without images
          }
        }

        await Deno.mkdir(docentenOutputDir, { recursive: true });
        const bssOutput = join(docentenOutputDir, "user-manual.pdf");
        console.log("Generating Brightspacosaurus user manual PDF...");
        const headerPath = await materializeAsset("reader-header.tex");
        const includeFilterPath = await materializeAsset("include-filter.lua");
        const bssCmd = new Deno.Command("pandoc", {
          args: [
            bssSource,
            "-o", bssOutput,
            `--resource-path=${bssDocsDir}`,
            "--pdf-engine=xelatex",
            "-V", "geometry:margin=2.5cm",
            "-V", "lang=nl",
            `--include-in-header=${headerPath}`,
            `--lua-filter=${includeFilterPath}`,
            "--syntax-highlighting=tango",
            "--toc",
            "--toc-depth=2",
            `-V`, `date=${new Date().toISOString().slice(0, 10)}`,
          ],
          stdout: "piped",
          stderr: "piped",
        });
        const bssResult = await bssCmd.output();
        if (bssResult.success) {
          console.log(`  ✓ ${relative(buildDir, bssOutput)}`);
        } else {
          const bssStderr = new TextDecoder().decode(bssResult.stderr);
          console.warn(`  ⚠ Brightspacosaurus user manual PDF failed (non-blocking):`);
          console.warn(`    ${bssStderr.trim()}`);
          await Deno.remove(bssOutput).catch(() => undefined);
        }
      } catch {
        // Brightspacosaurus user manual not found or error — skip
      }
    }
  }

  console.log(`Prepare complete.`);
}

async function runPack(config: ResolvedConfig): Promise<void> {
  const repoRoot = config.repoRoot;
  const buildDir = config.outputDir;
  const outputPath = join(dirname(buildDir), `${config.name}.v${config.version}.imscc`);

  // Run prepare first if build/content/ does not exist
  try {
    await Deno.stat(join(buildDir, "content"));
  } catch {
    console.log("build/brightspace/content/ not found, running prepare first...");
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
        const title = h1Match ? decodeHtmlEntities(h1Match[1].trim()) : basename(fullPath, extname(fullPath));

        const imgRegex = /src="([^"]+\.(?:png|jpg|jpeg|gif|svg|webp))"/gi;
        const dependencies: string[] = [];
        let imgMatch: RegExpExecArray | null;
        while ((imgMatch = imgRegex.exec(html)) !== null) {
          const imgSrc = imgMatch[1];
          if (!imgSrc.startsWith("http://") && !imgSrc.startsWith("https://")) {
            // Resolve relative path with respect to the HTML file
            const htmlDir = dirname(fullPath);
            const imgAbs = resolve(htmlDir, imgSrc);
            const imgRel = "content/" + relative(contentDir, imgAbs);
            dependencies.push(imgRel);
          }
        }

        entries.push({ id, title, href: relPath, type: "webcontent", dependencies });
      }
    }
  }
  await scanHtml(contentDir);

  // Scan QTI/quiz files in build
  const quizDir = join(buildDir, "quiz");
  try {
    await Deno.stat(quizDir);
    async function scanQuiz(dir: string): Promise<void> {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory) {
          await scanQuiz(fullPath);
        } else if (entry.isFile && entry.name.endsWith(".xml")) {
          const relPath = "quiz/" + relative(quizDir, fullPath);
          const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");
          const title = basename(fullPath, extname(fullPath));
          entries.push({ id, title, href: relPath, type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment" });
        }
      }
    }
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
        const title = basename(entry.name, ".pdf");
        entries.push({ id, title, href: relPath, type: "webcontent" });
      }
    }
  } catch {
    // No readers directory — PDF conversion is optional
  }

  // Instructor PDFs are NOT included in the .imscc (security risk: answers visible to students).
  // They do remain as standalone files in build/brightspace/docenten/ for internal use.
  // There is no instructor landing page: GitLab is the source of truth for instructor material.

  // Sort: HTML first, then quiz
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "webcontent" ? -1 : 1;
    return a.href.localeCompare(b.href);
  });

  const manifestXml = buildManifest(config.courseName, entries);
  await Deno.writeTextFile(join(buildDir, "imsmanifest.xml"), manifestXml);
  console.log("  ✓ imsmanifest.xml");

  // Pack
  console.log("Packaging into .imscc...");
  await pack({ sourceDir: buildDir, outputPath });
  console.log(`  ✓ ${relative(repoRoot, outputPath)}`);
  console.log("Pack complete.");
}

// --- Main ---

async function main(): Promise<void> {
  const args = Deno.args;
  const version = await loadPackageVersion();

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
      await runPrepare(resolvedConfig, parsed.readersOnly);
    } else if (parsed.command === "pack") {
      await runPack(resolvedConfig);
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
