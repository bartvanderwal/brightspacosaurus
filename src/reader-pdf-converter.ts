/**
 * ReaderPdfConverter: zet reader-Markdown-bestanden om naar PDF via pandoc.
 * Requirements: 6.1, 6.2, 6.4, 6.5, 6.6
 */

import { ReaderConvertOptions, ReaderConvertResult } from "./types.ts";
import { basename, dirname, join } from "@std/path";

/**
 * Controleert of pandoc beschikbaar is op het systeem.
 *
 * Roept `pandoc --version` aan en retourneert `true` als het commando
 * succesvol afsluit (exitcode 0). Wordt gebruikt voor:
 * - Graceful degradation: waarschuwing tonen als pandoc ontbreekt
 * - Tests overslaan die pandoc vereisen in omgevingen zonder pandoc
 *
 * @returns `true` als pandoc beschikbaar is, anders `false`
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
 * Converteert een reader-Markdown-bestand naar PDF via pandoc.
 *
 * Pandoc wordt aangeroepen als extern binair via `Deno.Command` met opties
 * voor leesbare typografie, Nederlandse taalsetting en inhoudsopgave.
 *
 * @param options - Conversieopties (bronpad, uitvoermap, repository-root)
 * @returns Pad naar het gegenereerde PDF-bestand en de bestandsnaam
 * @throws Error met bestandspad en stderr-output als pandoc faalt
 */
export async function convertReaderToPdf(
  options: ReaderConvertOptions,
): Promise<ReaderConvertResult> {
  const { sourcePath, outputDir } = options;

  // Bepaal uitvoerbestandsnaam: .md → .pdf
  const sourceFilename = basename(sourcePath);
  const pdfFilename = sourceFilename.replace(/\.md$/, ".pdf");
  const outputPath = join(outputDir, pdfFilename);

  // Maak uitvoermap aan
  await Deno.mkdir(outputDir, { recursive: true });

  // Bepaal resource-path (directory van het bronbestand) voor afbeeldingsresolutie
  const resourcePath = dirname(sourcePath);

  // Bepaal pad naar LaTeX header-include
  const scriptDir = import.meta.dirname ?? dirname(new URL(import.meta.url).pathname);
  const headerPath = join(scriptDir, "..", "assets", "reader-header.tex");
  const includeFilterPath = join(scriptDir, "..", "assets", "include-filter.lua");
  const diagramFilterPath = join(scriptDir, "..", "assets", "diagram-filter.lua");

  // Roep pandoc aan
  const command = new Deno.Command("pandoc", {
    args: [
      sourcePath,
      "-o",
      outputPath,
      `--resource-path=${resourcePath}`,
      "--pdf-engine=lualatex",
      "-V",
      "geometry:margin=2.5cm",
      "-V",
      "lang=nl",
      `--include-in-header=${headerPath}`,
      `--lua-filter=${includeFilterPath}`,
      `--lua-filter=${diagramFilterPath}`,
      "--syntax-highlighting=tango",
      "--toc",
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const process = await command.output();

  if (!process.success) {
    // Verwijder gedeeltelijk PDF-bestand als dat bestaat
    try {
      await Deno.remove(outputPath);
    } catch {
      // Bestand bestond niet of kon niet verwijderd worden — geen probleem
    }

    const stderr = new TextDecoder().decode(process.stderr);
    throw new Error(
      `Pandoc-conversie mislukt voor ${sourcePath}: ${stderr}`,
    );
  }

  return {
    outputPath,
    filename: pdfFilename,
  };
}
