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
import { basename, dirname, join, resolve } from "@std/path";

/** Metadata passed to pandoc for the generated reader PDF cover page. */
export interface ReaderPdfMetadata {
  /** Reader title shown on the cover page. */
  title: string;
  /** Optional author or course name shown on the cover page. */
  author?: string;
  /** Date and version as one line (PDF metadata). */
  date: string;
  /** Cover lines: original date, last change and version, labelled per locale. */
  coverLines: string[];
  /** Cover image path from `coverImage`, relative to the reader file. */
  coverImage?: string;
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

/** Cover labels per locale (`diagrams.locale`). */
const COVER_LABELS = {
  nl: {
    original: "Oorspronkelijke datum",
    updated: "Laatste wijziging",
    date: "Datum",
    version: "Versie",
  },
  en: {
    original: "Original date",
    updated: "Last updated",
    date: "Date",
    version: "Version",
  },
} as const;

/**
 * Derives reader PDF cover metadata from frontmatter, headings and fallbacks.
 *
 * Dates: the original date comes from `date`/`datum`; the last change from
 * Git (`sourceDate`), else from `updated`/`bijgewerkt`. Two different dates
 * give two lines; equal dates, or only one, give one line.
 */
export function deriveReaderPdfMetadata(
  content: string,
  filename: string,
  options: Pick<ReaderConvertOptions, "courseName" | "courseVersion"> & {
    sourceDate?: string | null;
    locale?: "nl" | "en";
  } = {},
): ReaderPdfMetadata {
  const labels = COVER_LABELS[options.locale ?? "nl"];
  const title = extractFrontmatterValue(content, "title") ??
    extractFirstHeading(content) ??
    humanizeReaderTitle(filename);
  const author = extractFrontmatterValue(content, "author") ??
    extractFrontmatterValue(content, "auteur") ??
    options.courseName;
  const original = extractFrontmatterValue(content, "date") ??
    extractFrontmatterValue(content, "datum");
  const updated = options.sourceDate ??
    extractFrontmatterValue(content, "updated") ??
    extractFrontmatterValue(content, "bijgewerkt");
  const version = extractFrontmatterValue(content, "version") ??
    extractFrontmatterValue(content, "versie") ??
    (options.courseVersion ? `${labels.version} ${options.courseVersion}` : null);

  const coverLines: string[] = [];
  if (original && updated && original !== updated) {
    coverLines.push(`${labels.original}: ${original}`, `${labels.updated}: ${updated}`);
  } else if (original) {
    coverLines.push(`${labels.date}: ${original}`);
  } else if (updated) {
    coverLines.push(`${labels.updated}: ${updated}`);
  }
  if (version) coverLines.push(version);

  const coverImage = extractFrontmatterValue(content, "coverImage");
  return {
    title,
    author: author ?? undefined,
    date: coverLines.join(" - "),
    coverLines,
    ...(coverImage ? { coverImage } : {}),
  };
}

/** Escapes text for use in LaTeX (cover lines). */
function escapeLatex(text: string): string {
  return text.replace(/[\\&%$#_{}~^]/g, (char) => {
    if (char === "\\") return "\\textbackslash{}";
    if (char === "~") return "\\textasciitilde{}";
    if (char === "^") return "\\textasciicircum{}";
    return `\\${char}`;
  });
}

/** LaTeX header that defines `\bsocoverdates` with one cover line per row. */
export function coverDatesHeader(lines: string[]): string | null {
  if (lines.length === 0) return null;
  return `\\newcommand{\\bsocoverdates}{${lines.map(escapeLatex).join("\\\\ ")}}\n`;
}

/** Characters LaTeX can take literally in an \includegraphics path. */
const SAFE_LATEX_PATH = /^[A-Za-z0-9._\/:-]+$/;

/**
 * LaTeX header that defines `\bsocoverimage` for the cover page, or null
 * when the path cannot be used safely in LaTeX.
 */
export function coverImageHeader(imagePath: string): string | null {
  return coverAssetHeader("bsocoverimage", imagePath);
}

/**
 * LaTeX header that defines `\bsocoverlogo` for the cover page, or null
 * when the path cannot be used safely in LaTeX.
 */
export function coverLogoHeader(logoPath: string): string | null {
  return coverAssetHeader("bsocoverlogo", logoPath);
}

function coverAssetHeader(macro: string, path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  if (!SAFE_LATEX_PATH.test(normalized)) return null;
  return `\\newcommand{\\${macro}}{${normalized}}\n`;
}

/**
 * Returns the header for an optional cover asset, or null with a warning
 * when the file is missing or its path is unusable in LaTeX.
 */
async function usableCoverAsset(
  path: string,
  header: string | null,
  description: string,
): Promise<string | null> {
  let exists = false;
  try {
    exists = (await Deno.stat(path)).isFile;
  } catch {
    // Reported below.
  }
  if (!exists) {
    console.warn(`⚠ ${description} not found: ${path} — PDF cover without it.`);
    return null;
  }
  if (!header) {
    console.warn(
      `⚠ ${description} path contains characters LaTeX cannot use (spaces or special characters): ${path} — PDF cover without it.`,
    );
    return null;
  }
  return header;
}

/** Returns the last Git commit date for a source file, or null when unavailable. */
export async function gitLastCommitDate(
  sourcePath: string,
  repoRoot: string,
): Promise<string | null> {
  try {
    // In a shallow clone (CI with GIT_DEPTH) the last commit that touched the
    // file may be missing, or replaced by a too recent one: use no Git date.
    const shallow = await new Deno.Command("git", {
      args: ["-C", repoRoot, "rev-parse", "--is-shallow-repository"],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (new TextDecoder().decode(shallow.stdout).trim() === "true") return null;

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
  /** Lua filter that numbers chapters and sections. */
  sectionNumberFilterPath: string;
  /** Document language, from `diagrams.locale`; default "nl". */
  locale?: "nl" | "en";
  /** Lua filter that starts every chapter on a new page; omitted when disabled. */
  chapterFilterPath?: string;
  metadata: ReaderPdfMetadata;
  /** Header defining the cover image and logo; included before the reader header. */
  coverHeaderPath?: string;
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
    `lang=${options.locale ?? "nl"}`,
    metadataArg("title", options.metadata.title),
    ...(options.metadata.author
      ? [metadataArg("author", options.metadata.author)]
      : []),
    ...(options.metadata.date
      ? [metadataArg("date", options.metadata.date)]
      : []),
    ...(options.coverHeaderPath
      ? [`--include-in-header=${options.coverHeaderPath}`]
      : []),
    `--include-in-header=${options.headerPath}`,
    `--lua-filter=${options.includeFilterPath}`,
    `--lua-filter=${options.diagramFilterPath}`,
    `--lua-filter=${options.sectionNumberFilterPath}`,
    ...(options.chapterFilterPath
      ? [`--lua-filter=${options.chapterFilterPath}`]
      : []),
    "--syntax-highlighting=tango",
    "--number-sections",
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
  const sectionNumberFilterPath = await materializeAsset("section-number-filter.lua");
  const chapterFilterPath = options.chapterNewPage === false
    ? undefined
    : await materializeAsset("chapter-filter.lua");
  const sourceContent = await Deno.readTextFile(sourcePath);
  const sourceDate = await gitLastCommitDate(sourcePath, options.repoRoot);
  const metadata = deriveReaderPdfMetadata(sourceContent, sourceFilename, {
    courseName: options.courseName,
    courseVersion: options.courseVersion,
    sourceDate,
    locale: options.locale,
  });

  // Optional cover image and logo, written as a small header next to the PDF output.
  const coverHeaders: string[] = [];
  const datesHeader = coverDatesHeader(metadata.coverLines);
  if (datesHeader) coverHeaders.push(datesHeader);
  if (metadata.coverImage) {
    const imagePath = resolve(resourcePath, metadata.coverImage);
    const header = await usableCoverAsset(
      imagePath,
      coverImageHeader(imagePath),
      `Cover image for ${sourceFilename}`,
    );
    if (header) coverHeaders.push(header);
  }
  if (options.coverLogoPath) {
    const header = await usableCoverAsset(
      options.coverLogoPath,
      coverLogoHeader(options.coverLogoPath),
      "Reader cover logo (readerCoverLogo)",
    );
    if (header) coverHeaders.push(header);
  }
  let coverHeaderPath: string | undefined;
  if (coverHeaders.length > 0) {
    coverHeaderPath = join(outputDir, `.${pdfFilename}.cover.tex`);
    await Deno.writeTextFile(coverHeaderPath, coverHeaders.join(""));
  }

  // Invoke pandoc
  const command = new Deno.Command("pandoc", {
    args: buildReaderPandocArgs({
      sourcePath,
      outputPath,
      resourcePath,
      headerPath,
      includeFilterPath,
      diagramFilterPath,
      sectionNumberFilterPath,
      locale: options.locale,
      chapterFilterPath,
      metadata,
      coverHeaderPath,
    }),
    stdout: "piped",
    stderr: "piped",
  });

  const process = await command.output().finally(async () => {
    if (coverHeaderPath) await Deno.remove(coverHeaderPath).catch(() => {});
  });

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
