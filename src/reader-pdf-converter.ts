/**
 * Converts reader Markdown files to print-oriented PDFs via pandoc.
 *
 * Reader PDFs include a mandatory cover page, table of contents, bundled
 * LaTeX styling and Lua filters for includes and diagrams.
 *
 * @module
 */

import type { ReaderConvertOptions, ReaderConvertResult } from "./types.ts";
import { materializeAsset } from "./assets.ts";
import { basename, dirname, join } from "@std/path";

/** Metadata passed to pandoc for the generated reader PDF cover page. */
export interface ReaderPdfMetadata {
  /** Reader title shown on the cover page. */
  title: string;
  /** Optional author or course name shown on the cover page. */
  author?: string;
  /** Date/version line shown on the cover page. */
  date: string;
}

function humanizeReaderTitle(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/^reader[-_]/i, "");
  const words = stem.split(/[-_\s]+/).filter((word) => word.length > 0);
  const title = words.map((word, index) => {
    const normalized = word.toLowerCase();
    const special: Record<string, string> = {
      git: "Git",
      github: "GitHub",
      gitlab: "GitLab",
      javascript: "JavaScript",
      plantuml: "PlantUML",
      typescript: "TypeScript",
      uml: "UML",
    };
    return special[normalized] ??
      (index === 0
        ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
        : normalized);
  }).join(" ");
  return title ? `Reader ${title}` : "Reader";
}

function extractFrontmatterValue(content: string, key: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const valueMatch = match[1].match(
    new RegExp(`^${escapedKey}\\s*:\\s*(.+)$`, "im"),
  );
  if (!valueMatch) return null;

  return valueMatch[1].trim().replace(/^["']|["']$/g, "");
}

function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/** Derives reader PDF cover metadata from frontmatter, headings and fallbacks. */
export function deriveReaderPdfMetadata(
  content: string,
  filename: string,
  options: Pick<ReaderConvertOptions, "courseName" | "courseVersion"> & {
    sourceDate?: string | null;
  } = {},
): ReaderPdfMetadata {
  const title = extractFrontmatterValue(content, "title") ??
    extractFirstHeading(content) ??
    humanizeReaderTitle(filename);
  const author = extractFrontmatterValue(content, "author") ??
    extractFrontmatterValue(content, "auteur") ??
    options.courseName;
  const dateParts = [
    extractFrontmatterValue(content, "date") ??
      extractFrontmatterValue(content, "datum") ??
      options.sourceDate,
    extractFrontmatterValue(content, "version") ??
      extractFrontmatterValue(content, "versie") ??
      (options.courseVersion ? `Versie ${options.courseVersion}` : null),
  ].filter((part): part is string => Boolean(part));

  return {
    title,
    author: author ?? undefined,
    date: dateParts.join(" - "),
  };
}

/** Returns the last Git commit date for a source file, or null when unavailable. */
export async function gitLastCommitDate(
  sourcePath: string,
  repoRoot: string,
): Promise<string | null> {
  try {
    const command = new Deno.Command("git", {
      args: ["-C", repoRoot, "log", "-1", "--format=%cs", "--", sourcePath],
      stdout: "piped",
      stderr: "null",
    });
    const output = await command.output();
    if (!output.success) return null;

    const date = new TextDecoder().decode(output.stdout).trim();
    return date.length > 0 ? date : null;
  } catch {
    return null;
  }
}

function metadataArg(key: string, value: string): string {
  return `--metadata=${key}:${value}`;
}

/** Builds the deterministic pandoc argument list for reader PDF conversion. */
export function buildReaderPandocArgs(options: {
  sourcePath: string;
  outputPath: string;
  resourcePath: string;
  headerPath: string;
  includeFilterPath: string;
  diagramFilterPath: string;
  metadata: ReaderPdfMetadata;
}): string[] {
  const args = [
    options.sourcePath,
    "-o",
    options.outputPath,
    `--resource-path=${options.resourcePath}`,
    "--pdf-engine=lualatex",
    "-V",
    "geometry:margin=2.5cm",
    "-V",
    "lang=nl",
    metadataArg("title", options.metadata.title),
    ...(options.metadata.author
      ? [metadataArg("author", options.metadata.author)]
      : []),
    ...(options.metadata.date
      ? [metadataArg("date", options.metadata.date)]
      : []),
    `--include-in-header=${options.headerPath}`,
    `--lua-filter=${options.includeFilterPath}`,
    `--lua-filter=${options.diagramFilterPath}`,
    "--syntax-highlighting=tango",
    "--toc",
  ];

  return args;
}

/**
 * Checks whether pandoc is available on the system.
 *
 * Calls `pandoc --version` and returns `true` if the command
 * exits successfully (exit code 0). Used for:
 * - Graceful degradation: show a warning if pandoc is missing
 * - Skipping tests that require pandoc in environments without pandoc
 *
 * @returns `true` if pandoc is available, otherwise `false`
 */
export function pandocAvailable(): boolean {
  try {
    const cmd = new Deno.Command("pandoc", { args: ["--version"] });
    const { code } = cmd.outputSync();
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Converts a reader Markdown file to PDF via pandoc.
 *
 * Pandoc is invoked as an external binary via `Deno.Command` with options
 * for readable typography, Dutch language setting and a table of contents.
 *
 * @param options - Conversion options (source path, output directory, repository root)
 * @returns Path to the generated PDF file and the file name
 * @throws Error with file path and stderr output if pandoc fails
 */
export async function convertReaderToPdf(
  options: ReaderConvertOptions,
): Promise<ReaderConvertResult> {
  const { sourcePath, outputDir } = options;

  // Determine output file name: .md → .pdf
  const sourceFilename = basename(sourcePath);
  const pdfFilename = sourceFilename.replace(/\.md$/, ".pdf");
  const outputPath = join(outputDir, pdfFilename);

  // Create output directory
  await Deno.mkdir(outputDir, { recursive: true });

  // Determine resource path (directory of the source file) for image resolution
  const resourcePath = dirname(sourcePath);

  // Materialize the bundled assets to temporary files so pandoc
  // can read them (works both locally and from the JSR cache).
  const headerPath = await materializeAsset("reader-header.tex");
  const includeFilterPath = await materializeAsset("include-filter.lua");
  const diagramFilterPath = await materializeAsset("diagram-filter.lua");
  const sourceContent = await Deno.readTextFile(sourcePath);
  const sourceDate = await gitLastCommitDate(sourcePath, options.repoRoot);
  const metadata = deriveReaderPdfMetadata(sourceContent, sourceFilename, {
    courseName: options.courseName,
    courseVersion: options.courseVersion,
    sourceDate,
  });

  // Invoke pandoc
  const command = new Deno.Command("pandoc", {
    args: buildReaderPandocArgs({
      sourcePath,
      outputPath,
      resourcePath,
      headerPath,
      includeFilterPath,
      diagramFilterPath,
      metadata,
    }),
    stdout: "piped",
    stderr: "piped",
  });

  const process = await command.output();

  if (!process.success) {
    // Remove the partial PDF file if it exists
    try {
      await Deno.remove(outputPath);
    } catch {
      // File did not exist or could not be removed — no problem
    }

    const stderr = new TextDecoder().decode(process.stderr);
    throw new Error(
      `Pandoc conversion failed for ${sourcePath}: ${stderr}`,
    );
  }

  return {
    outputPath,
    filename: pdfFilename,
  };
}
