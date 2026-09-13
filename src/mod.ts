/**
 * Brightspacosaurus — Markdown cursusmateriaal → Brightspace Common Cartridge (.imscc)
 *
 * @module
 */

// Config
export {
  EXAMPLE_CONFIG,
  findConfigFile,
  loadConfig,
  resolveConfig,
  resolveFromCliOnly,
  validateConfig,
} from "./config-loader.ts";

// Types
export type {
  BsoConfig,
  CliOverrides,
  ConvertOptions,
  ConvertResult,
  DiagramsConfig,
  ManifestEntry,
  PackOptions,
  QuizConfig,
  ReaderConvertOptions,
  ReaderConvertResult,
  ResolvedConfig,
  ResolvedDiagramConfig,
  ResolvedQuizConfig,
  ResolvedTeacherManualConfig,
  ScanOptions,
  ScanResult,
  TeacherManualConfig,
} from "./types.ts";

// Core modules
export { scanSources } from "./source-scanner.ts";
export { convertMarkdown } from "./markdown-converter.ts";
export { convertQuiz } from "./quiz-converter.ts";
export { convertReaderToPdf, pandocAvailable } from "./reader-pdf-converter.ts";
export {
  buildManifest,
  sortManifestEntriesForNavigation,
} from "./manifest-builder.ts";
export { pack } from "./packer.ts";
export {
  buildKrokiA11yOptions,
  SUPPORTED_DIAGRAM_LANGUAGES,
} from "./diagram-config.ts";
export {
  DiagramError,
  diagramIssueToError,
  formatDiagramWarning,
  shouldFallbackDiagramError,
  toDiagramError,
  withDiagramRendering,
} from "./diagram-renderer.ts";
export { rehypeBrightspaceDiagramAdapter } from "./diagram-adapter.ts";
export { detectDiagramIssues } from "./diagram-validation.ts";
export type { KrokiA11yOptions } from "./diagram-config.ts";
export type { DiagramErrorCategory } from "./diagram-renderer.ts";
export type { DiagramIssue, DiagramIssueKind } from "./diagram-validation.ts";
