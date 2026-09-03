/**
 * ReaderPdfConverter: converts reader Markdown files to PDF via pandoc.
 * Requirements: 6.1, 6.2, 6.4, 6.5, 6.6
 */

import { ReaderConvertOptions, ReaderConvertResult } from "./types.ts";
import { materializeAsset } from "./assets.ts";
import { basename, dirname, join } from "@std/path";

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

  // Invoke pandoc
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
