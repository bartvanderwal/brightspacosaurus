/**
 * SourceScanner: scant de bronmap en classificeert bestanden op bestandsnaam.
 * Quiz-bestanden worden herkend aan het prefix "quiz-".
 * Requirements: 1.1, 3.1, 3.2, 3.4, 6.1
 */

import { ScanOptions, ScanResult } from "./types.ts";
import { resolve, relative, join } from "@std/path";

/**
 * Controleert of een pad binnen de repository-root valt.
 * Gooit een fout met exitcode 3 als het pad buiten de root valt.
 */
function assertWithinRoot(absPath: string, repoRoot: string): void {
  const rel = relative(repoRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    const err = new Error(`Pad buiten repository-root geweigerd: ${absPath} (root: ${repoRoot})`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }
}

/**
 * Bepaalt of een bestandsnaam een reader is.
 * Een bestand is een reader als het prefix `reader-` heeft of de naam `plantuml-essentials.md` is.
 * Bestanden met prefix `TODO-` of `quiz-` worden uitgesloten.
 */
function isReaderFile(fileName: string): boolean {
  if (fileName.startsWith("TODO-") || fileName.startsWith("quiz-")) {
    return false;
  }
  return fileName.startsWith("reader-") || fileName === "plantuml-essentials.md";
}

/**
 * Scant een map recursief voor .md-bestanden en classificeert ze.
 * Bestanden direct in de top-level map die aan reader-criteria voldoen komen in readerFiles.
 * Bestanden in submappen worden geclassificeerd als markdownFiles of quizFiles.
 */
async function scanDir(dir: string): Promise<{ markdownFiles: string[]; quizFiles: string[]; readerFiles: string[] }> {
  const markdownFiles: string[] = [];
  const quizFiles: string[] = [];
  const readerFiles: string[] = [];

  async function walk(currentDir: string, isTopLevel: boolean): Promise<void> {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath, false);
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        // Bestanden op top-niveau: classificeer als reader indien van toepassing
        if (isTopLevel && isReaderFile(entry.name)) {
          readerFiles.push(fullPath);
        } else if (entry.name.startsWith("quiz-") && !entry.name.includes("-antwoorden-docent")) {
          quizFiles.push(fullPath);
        } else if (!entry.name.startsWith("quiz-") && !entry.name.startsWith("transcript-") && !entry.name.startsWith("TODO-")) {
          markdownFiles.push(fullPath);
        }
        // quiz-*-antwoorden-docent.md bestanden worden bewust overgeslagen:
        // ze horen niet als pagina in Brightspace (quizzen komen via QTI)
      }
    }
  }

  await walk(dir, true);
  markdownFiles.sort();
  quizFiles.sort();
  readerFiles.sort();
  return { markdownFiles, quizFiles, readerFiles };
}

/**
 * Scant de bronmap en geeft gesorteerde bestandslijsten terug,
 * geclassificeerd op bestandsnaam (prefix "quiz-" = quiz).
 *
 * @param options - Scanopties met bronmap en repository-root
 * @returns Gesorteerde lijsten van les-Markdown en quiz-Markdown bestanden
 * @throws Fout met exitCode 2 als de bronmap niet bestaat
 * @throws Fout met exitCode 3 als het pad buiten de repository-root valt
 */
export async function scanSources(options: ScanOptions): Promise<ScanResult> {
  const repoRoot = resolve(options.repoRoot);
  const sourcesDir = resolve(options.sourcesDir);

  assertWithinRoot(sourcesDir, repoRoot);

  // Controleer of de bronmap bestaat
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(sourcesDir);
  } catch {
    const err = new Error(`Bronmap niet gevonden: ${sourcesDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  if (!stat.isDirectory) {
    const err = new Error(`Opgegeven pad is geen map: ${sourcesDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  return await scanDir(sourcesDir);
}
