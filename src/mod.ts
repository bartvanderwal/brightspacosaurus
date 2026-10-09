/**
 * Brightspacosaurus public API for converting Markdown course material to
 * Brightspace Common Cartridge packages.
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
  LintConfig,
  ManifestEntry,
  PackOptions,
  QuizConfig,
  ReaderConvertOptions,
  ReaderConvertResult,
  ResolvedConfig,
  ResolvedDiagramConfig,
  ResolvedQuizConfig,
  ResolvedTeacherManualConfig,
  ResolvedTeacherPageConfig,
  ScanOptions,
  ScanResult,
  TeacherManualConfig,
} from "./types.ts";

// Core modules
export { scanSources } from "./source-scanner.ts";
export { convertMarkdown } from "./markdown-converter.ts";
export {
  DEFAULT_SECTION_HEADINGS,
  normalizeSectionHeading,
  remarkFlashcards,
  resolveFlashcardsOptions,
} from "./flashcards.ts";
export type { FlashcardNode, FlashcardsConfig } from "./flashcards.ts";
export {
  DASHBOARD_DIRECTIVE,
  DEFAULT_TEACHER_PAGE,
  insertVersionTable,
  remarkTeacherDashboard,
  renderVersionTable,
  resolveTeacherPage,
  VERSIONS_DIRECTIVE,
} from "./teacher-page.ts";
export type {
  TeacherDashboardTabsOptions,
  TeacherPageVersions,
} from "./teacher-page.ts";
export { convertQuiz } from "./quiz-converter.ts";
export { convertReaderToPdf, pandocAvailable } from "./reader-pdf-converter.ts";
export {
  buildManifest,
  deriveReaderMenuTitle,
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
export type {
  DiagramIssue,
  DiagramIssueKind,
  DiagramIssuePosition,
} from "./diagram-validation.ts";

// Shared authoring validation and preview adapters
export {
  formatLintDiagnostic,
  lintCourse,
  lintMarkdown,
} from "./course-linter.ts";
export type {
  LintDiagnostic,
  LintOptions,
  LintResult,
} from "./course-linter.ts";
export {
  assertValidQuiz,
  parseQuizMarkdown,
  validateQuiz,
} from "./quiz-parser.ts";
export type { ParsedQuiz, QuizIssue, QuizQuestion } from "./quiz-parser.ts";
export {
  checkQuizBias,
  defaultQuizBiasOptions,
  parseTeacherAnswers,
} from "./quiz-bias.ts";
export type { QuizBiasFinding, QuizBiasOptions } from "./quiz-bias.ts";
export { resolveQuizOptions } from "./quiz-config.ts";
export { remarkQuizPreview } from "./quiz-preview.ts";
