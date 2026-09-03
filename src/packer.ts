/**
 * Packer: packages build/brightspace/ into a .imscc archive.
 * Requirements: 2.2, 2.4, 2.5, 6.3
 */

import { PackOptions } from "./types.ts";
import { join, relative } from "@std/path";
import JSZip from "jszip";

/**
 * Collects all files in a directory recursively, sorted by relative path.
 */
async function collectFiles(dir: string, baseDir: string): Promise<{ relPath: string; absPath: string }[]> {
  const files: { relPath: string; absPath: string }[] = [];

  async function walk(currentDir: string): Promise<void> {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath);
      } else if (entry.isFile) {
        // Exclude previously generated .imscc archives
        if (entry.name.endsWith(".imscc")) continue;
        const relPath = relative(baseDir, fullPath);
        files.push({ relPath, absPath: fullPath });
      }
    }
  }

  await walk(dir);
  // Deterministic order: sorted by relative path
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return files;
}

/**
 * Packages the content of sourceDir into a .imscc archive at outputPath.
 *
 * - Deterministic file order (sorted by path)
 * - Removes a partially created file on error
 *
 * @param options - Pack options with source directory and output path
 * @throws Error with exitCode 2 if the source directory does not exist or is empty
 * @throws Error with exitCode 4 if archiving fails
 */
export async function pack(options: PackOptions): Promise<void> {
  const { sourceDir, outputPath } = options;

  // Check that the source directory exists
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(sourceDir);
  } catch {
    const err = new Error(`Source directory not found: ${sourceDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  if (!stat.isDirectory) {
    const err = new Error(`Given path is not a directory: ${sourceDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  // Collect files (excluding the output file itself if it already exists)
  const files = await collectFiles(sourceDir, sourceDir);
  const outputRelPath = relative(sourceDir, outputPath);
  const filteredFiles = files.filter((f) => f.relPath !== outputRelPath);

  if (filteredFiles.length === 0) {
    const err = new Error(`Source directory is empty: ${sourceDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  // Create the zip archive
  const zip = new JSZip();
  const deterministicDate = new Date("1980-01-01T00:00:00Z");

  for (const file of filteredFiles) {
    const content = await Deno.readFile(file.absPath);
    zip.file(file.relPath, content, {
      createFolders: false,
      date: deterministicDate,
    });
  }

  try {
    const zipContent = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    await Deno.writeFile(outputPath, zipContent);
  } catch (e) {
    // Remove the partially created file
    try {
      await Deno.remove(outputPath);
    } catch {
      // File did not exist, no problem
    }
    const err = new Error(`Archiving error: ${(e as Error).message}`);
    (err as Error & { exitCode: number }).exitCode = 4;
    throw err;
  }
}
