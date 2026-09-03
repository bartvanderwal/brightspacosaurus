/**
 * SourceScanner: scans the source directory and classifies files by file name.
 * Quiz files are recognized by the "quiz-" prefix.
 * Requirements: 1.1, 3.1, 3.2, 3.4, 6.1
 */

import { ScanOptions, ScanResult } from "./types.ts";
import { resolve, relative, join } from "@std/path";

/**
 * Checks whether a path is within the repository root.
 * Throws an error with exit code 3 if the path falls outside the root.
 */
function assertWithinRoot(absPath: string, repoRoot: string): void {
  const rel = relative(repoRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    const err = new Error(`Path outside repository root rejected: ${absPath} (root: ${repoRoot})`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }
}

/**
 * Determines whether a file name is a reader.
 * A file is a reader if it has the `reader-` prefix or the name `plantuml-essentials.md`.
 * Files with the prefix `TODO-` or `quiz-` are excluded.
 */
function isReaderFile(fileName: string): boolean {
  if (fileName.startsWith("TODO-") || fileName.startsWith("quiz-")) {
    return false;
  }
  return fileName.startsWith("reader-") || fileName === "plantuml-essentials.md";
}

/**
 * Scans a directory recursively for .md files and classifies them.
 * Files directly in the top-level directory that meet the reader criteria go into readerFiles.
 * Files in subdirectories are classified as markdownFiles or quizFiles.
 */
async function scanDir(dir: string): Promise<{ markdownFiles: string[]; quizFiles: string[]; readerFiles: string[]; pdfFiles: string[] }> {
  const markdownFiles: string[] = [];
  const quizFiles: string[] = [];
  const readerFiles: string[] = [];
  const pdfFiles: string[] = [];

  async function walk(currentDir: string, isTopLevel: boolean): Promise<void> {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath, false);
      } else if (entry.isFile && entry.name.endsWith(".pdf") && isTopLevel) {
        // Pre-generated PDF files at the top level
        pdfFiles.push(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        // Top-level files: classify as reader where applicable
        if (isTopLevel && isReaderFile(entry.name)) {
          readerFiles.push(fullPath);
        } else if (entry.name.startsWith("quiz-") && !entry.name.includes("-antwoorden-docent")) {
          quizFiles.push(fullPath);
        } else if (!entry.name.startsWith("quiz-") && !entry.name.startsWith("transcript-") && !entry.name.startsWith("TODO-")) {
          markdownFiles.push(fullPath);
        }
        // quiz-*-antwoorden-docent.md files are deliberately skipped:
        // they do not belong as a page in Brightspace (quizzes come in via QTI)
      }
    }
  }

  await walk(dir, true);
  markdownFiles.sort();
  quizFiles.sort();
  readerFiles.sort();
  pdfFiles.sort();
  return { markdownFiles, quizFiles, readerFiles, pdfFiles };
}

/**
 * Scans the source directory and returns sorted file lists,
 * classified by file name (prefix "quiz-" = quiz).
 *
 * @param options - Scan options with source directory and repository root
 * @returns Sorted lists of lesson Markdown and quiz Markdown files
 * @throws Error with exitCode 2 if the source directory does not exist
 * @throws Error with exitCode 3 if the path falls outside the repository root
 */
export async function scanSources(options: ScanOptions): Promise<ScanResult> {
  const repoRoot = resolve(options.repoRoot);
  const sourcesDir = resolve(options.sourcesDir);

  assertWithinRoot(sourcesDir, repoRoot);

  // Check that the source directory exists
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(sourcesDir);
  } catch {
    const err = new Error(`Source directory not found: ${sourcesDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  if (!stat.isDirectory) {
    const err = new Error(`Given path is not a directory: ${sourcesDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  return await scanDir(sourcesDir);
}
