/**
 * Packer: verpakt build/brightspace/ tot een .imscc-archief.
 * Requirements: 2.2, 2.4, 2.5, 6.3
 */

import { PackOptions } from "./types.ts";
import { join, relative } from "@std/path";
import JSZip from "jszip";

/**
 * Verzamelt alle bestanden in een map recursief, gesorteerd op relatief pad.
 */
async function collectFiles(dir: string, baseDir: string): Promise<{ relPath: string; absPath: string }[]> {
  const files: { relPath: string; absPath: string }[] = [];

  async function walk(currentDir: string): Promise<void> {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath);
      } else if (entry.isFile) {
        // Exclude eerder gegenereerde .imscc-archieven
        if (entry.name.endsWith(".imscc")) continue;
        const relPath = relative(baseDir, fullPath);
        files.push({ relPath, absPath: fullPath });
      }
    }
  }

  await walk(dir);
  // Deterministische volgorde: gesorteerd op relatief pad
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return files;
}

/**
 * Verpakt de inhoud van sourceDir tot een .imscc-archief op outputPath.
 *
 * - Deterministische bestandsvolgorde (gesorteerd op pad)
 * - Verwijdert gedeeltelijk aangemaakt bestand bij een fout
 *
 * @param options - Pack-opties met bronmap en uitvoerpad
 * @throws Fout met exitCode 2 als de bronmap niet bestaat of leeg is
 * @throws Fout met exitCode 4 als de archivering mislukt
 */
export async function pack(options: PackOptions): Promise<void> {
  const { sourceDir, outputPath } = options;

  // Controleer of de bronmap bestaat
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(sourceDir);
  } catch {
    const err = new Error(`Bronmap niet gevonden: ${sourceDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  if (!stat.isDirectory) {
    const err = new Error(`Opgegeven pad is geen map: ${sourceDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  // Verzamel bestanden (exclusief het outputbestand zelf als dat al bestaat)
  const files = await collectFiles(sourceDir, sourceDir);
  const outputRelPath = relative(sourceDir, outputPath);
  const filteredFiles = files.filter((f) => f.relPath !== outputRelPath);

  if (filteredFiles.length === 0) {
    const err = new Error(`Bronmap is leeg: ${sourceDir}`);
    (err as Error & { exitCode: number }).exitCode = 2;
    throw err;
  }

  // Maak het zip-archief aan
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
    // Verwijder gedeeltelijk aangemaakt bestand
    try {
      await Deno.remove(outputPath);
    } catch {
      // Bestand bestond niet, geen probleem
    }
    const err = new Error(`Archiveringsfout: ${(e as Error).message}`);
    (err as Error & { exitCode: number }).exitCode = 4;
    throw err;
  }
}
