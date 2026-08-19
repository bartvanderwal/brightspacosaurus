/**
 * Brightspacosaurus — Markdown cursusmateriaal → Brightspace Common Cartridge (.imscc)
 *
 * @module
 */

// Config
export { loadConfig, validateConfig, resolveConfig, resolveFromCliOnly, findConfigFile, EXAMPLE_CONFIG } from "./config-loader.ts";

// Types
export type { BssConfig, DocentenHandleidingConfig, ResolvedConfig, ResolvedDocentenConfig, CliOverrides, ConvertOptions, ConvertResult, ManifestEntry, PackOptions, ScanOptions, ScanResult, ReaderConvertOptions, ReaderConvertResult } from "./types.ts";

// Core modules
export { scanSources } from "./source-scanner.ts";
export { convertMarkdown } from "./markdown-converter.ts";
export { convertQuiz } from "./quiz-converter.ts";
export { convertReaderToPdf, pandocAvailable } from "./reader-pdf-converter.ts";
export { buildManifest } from "./manifest-builder.ts";
export { pack } from "./packer.ts";
