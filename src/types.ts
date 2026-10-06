import type { FlashcardsConfig } from "./flashcards.ts";
import type { TeacherPageVersions } from "./teacher-page.ts";

/**
 * TypeScript-interfaces voor Brightspacosaurus.
 * Requirements: 3.1
 */

// --- SourceScanner ---

/** Opties voor het scannen van de bronmap. */
export interface ScanOptions {
  /** Bronmap voor les- en quiz-Markdown. Standaard: "6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/Lesbeschrijvingen/" */
  sourcesDir: string;
  /** Repository-root voor padvalidatie. */
  repoRoot: string;
}

/** Resultaat van het scannen van de bronmap. */
export interface ScanResult {
  /** Absolute paden naar reguliere les-Markdown bestanden, gesorteerd. */
  markdownFiles: string[];
  /** Absolute paden naar quiz-Markdown bestanden (prefix "quiz-"), gesorteerd. */
  quizFiles: string[];
  /** Absolute paden naar reader-Markdown bestanden (prefix "reader-" of "plantuml-essentials.md"), gesorteerd. */
  readerFiles: string[];
  /** Absolute paden naar vooraf gegenereerde PDF-bestanden in de readersDir. */
  pdfFiles: string[];
}

// --- MarkdownConverter ---

/** Opties voor het converteren van een Markdown-bestand naar HTML. */
export interface ConvertOptions {
  /** Absoluut pad naar het bronbestand. */
  sourcePath: string;
  /** Absoluut pad naar de uitvoermap (build/brightspace/content/). */
  outputDir: string;
  /** Repository-root voor padvalidatie. */
  repoRoot: string;
  /** Versienummer voor de badge (uit config). Standaard: "?" als niet opgegeven. */
  version?: string;
  /** BSO package version loaded from deno.json. */
  packageVersion?: string;
  /** Absoluut pad naar een custom CSS-bestand. Wordt naast de standaard-CSS opgenomen. */
  customCssPath?: string;
  /** Basismap waartegen het output-pad relatief wordt bepaald. Standaard: repoRoot. Gebruik sourcesDir om diepe repo-structuren af te vlakken. */
  baseDir?: string;
  /** Definitieve diagram-instellingen voor HTML-diagramrendering. */
  diagrams?: ResolvedDiagramConfig;
  /** Automatic flashcards for configured section headings. */
  flashcards?: FlashcardsConfig;
  /** Set for the teacher page only: versions filled in at `{@bso-versions}`. */
  teacherPageVersions?: TeacherPageVersions;
  /**
   * Teacher page only: relative URL of the Voortgangsverkenner for
   * `{@bso-teacher-dashboard}`, or null when `teacherDashboard` is not configured.
   */
  teacherDashboardSrc?: string | null;
}

/** Resultaat van de Markdown-naar-HTML-conversie. */
export interface ConvertResult {
  /** Absoluut pad naar het gegenereerde HTML-bestand. */
  outputPath: string;
  /** Paden naar gekopieerde afbeeldingen. */
  copiedImages: string[];
}

// --- ManifestBuilder ---

/** Een resource-entry in imsmanifest.xml. */
/** Menu module for the reader PDFs (see BsoConfig.readersModule). */
export interface ReadersModuleConfig {
  /** Folder name / identifier part, default "readers". */
  slug: string;
  /** Module title; null keeps the folder module's own title or "Readers". */
  title: string | null;
}

export interface ManifestEntry {
  /** Unieke identifier voor de resource. */
  id: string;
  /** Mensleesbare titel. */
  title: string;
  /** Relatief pad naar het bestand in het archief. */
  href: string;
  /** Resourcetype: webcontent of QTI-assessment. */
  type: "webcontent" | "imsqti_xmlv1p2/imscc_xmlv1p3/assessment";
  /** Relatieve paden naar afhankelijke bestanden (afbeeldingen). */
  dependencies?: string[];
  /** `sidebar_position` from the page's front matter, as in Docusaurus. */
  position?: number;
}

// --- Packer ---

/** Opties voor het verpakken van de build-map tot een .imscc-archief. */
export interface PackOptions {
  /** Absoluut pad naar de bronmap (build/brightspace/). */
  sourceDir: string;
  /** Absoluut pad naar het uitvoerbestand (build/brightspace/owe-1.imscc). */
  outputPath: string;
}

// --- ReaderPdfConverter ---

/** Opties voor het converteren van een reader-Markdown naar PDF via pandoc. */
export interface ReaderConvertOptions {
  /** Absoluut pad naar het reader-Markdown-bestand. */
  sourcePath: string;
  /** Absoluut pad naar de uitvoermap (build/brightspace/readers/). */
  outputDir: string;
  /** Repository-root voor padresolutie van afbeeldingen. */
  repoRoot: string;
  /** Cursusnaam voor het PDF-voorblad. */
  courseName?: string;
  /** Cursus-/pakketversie voor het PDF-voorblad. */
  courseVersion?: string;
  /** Absolute path to a logo shown on every reader cover page. Optional. */
  coverLogoPath?: string;
  /** Language of the cover labels (from `diagrams.locale`), default "nl". */
  /** Start every chapter on a new page (`readerChapterNewPage`), default true. */
  chapterNewPage?: boolean;
  locale?: "nl" | "en";
}

/** Resultaat van de reader-Markdown-naar-PDF-conversie. */
export interface ReaderConvertResult {
  /** Absoluut pad naar het gegenereerde PDF-bestand. */
  outputPath: string;
  /** Bestandsnaam van de PDF (bijv. "reader-git-en-gitlab.pdf"). */
  filename: string;
}

// --- Config Loader ---

/**
 * Schema van het brightspacosaurus.config.json configuratiebestand.
 * Requirements: 1.3, 1.7
 */
export interface BsoConfig {
  /** Cursusnaam voor het manifest. Verplicht. */
  courseName: string;
  /** Versienummer (gebruikt in .imscc-bestandsnaam en HTML-badge). Verplicht. */
  version: string;
  /** Bronmap voor lespagina's en quizzen (relatief aan Repo_Root). Verplicht. */
  sourcesDir: string;
  /** Bronmap voor readers (relatief aan Repo_Root). Optioneel. */
  readersDir?: string;
  /**
   * Menu module for the reader PDFs. `slug` defaults to "readers" (a separate
   * module); when a content folder with the same name exists, the readers are
   * added to that module after its pages. `title` overrides the module title.
   */
  readersModule?: { slug?: string; title?: string };
  /** Start every chapter of a reader PDF on a new page (default true). */
  readerChapterNewPage?: boolean;
  /** Logo on every reader PDF cover page (relative to Repo_Root). Optional. */
  readerCoverLogo?: string;
  /** Map met statische assets (relatief aan Repo_Root). Optioneel. */
  assetsDir?: string;
  /** Build-uitvoermap (relatief aan Repo_Root). Standaard: "build/brightspace". */
  outputDir?: string;
  /** Pad naar een custom CSS-bestand (relatief aan Repo_Root). Optioneel. */
  customCss?: string;
  /** Projectnaam voor het .imscc-bestand (standaard: afgeleid van courseName). */
  name?: string;
  /** Path to the Docusaurus directory for `bso preview` (relative to Repo_Root). Optional. */
  docusaurusDir?: string;
  /** Configuration for instructor manual generation. Optional. */
  teacherManual?: TeacherManualConfig;
  /** Configuratie voor gegenereerde quizzen/toetsen. Optioneel. */
  quiz?: QuizConfig;
  /** Configuratie voor diagramrendering (PlantUML/Mermaid via Kroki). Optioneel. */
  diagrams?: DiagramsConfig;
  /** Automatic flashcards for configured section headings. */
  flashcards?: FlashcardsConfig;
  /** Teacher page relative to sourcesDir, filled with versions. Default: "for-teachers.md". */
  teacherPage?: string;
  /** Optional lint input selection. */
  lint?: LintConfig;
  /** Configuration for teacher progress dashboard (GitLab work items per student). Optional. */
  teacherDashboard?: TeacherDashboardConfig;
}

/** Configuratie voor gegenereerde Brightspace quizzen/toetsen. */
export interface QuizConfig {
  /** Maximum aantal pogingen per gegenereerde toets. 0 betekent onbeperkt. Standaard: 0. */
  maxAttempts?: number;
  /** Shuffle answer choices per attempt. Default: false. */
  shuffleAnswers?: boolean;
}

/**
 * Configuratie voor diagramrendering (Requirement 2).
 * Alle velden zijn optioneel; ontbrekende velden krijgen defaults bij resolutie.
 */
export interface DiagramsConfig {
  /** Kroki_Endpoint (gemapt naar de remark-kroki `server`-optie). Standaard: "https://kroki.io". */
  krokiUrl?: string;
  /** Outputmodus (gemapt naar de remark-kroki `output`-optie). Standaard: "img-html-base64". */
  output?: "img-html-base64" | "inline-svg" | "img-base64" | "object-base64";
  /** Build laten falen bij een diagramfout. Standaard: true. */
  failOnError?: boolean;
  /** Language of the generated labels (diagram UI, reader PDF cover and document language). Standaard: "nl". */
  locale?: "nl" | "en";
}

/** Configuration for instructor manual PDF generation. */
export interface TeacherManualConfig {
  /** Lijst van Markdown-bronbestanden (relatief aan Repo_Root). */
  inputFiles: string[];
  /** Bestandsnaam voor de output-PDF (zonder pad). */
  outputName?: string;
  /** Output-directory (relatief aan Repo_Root). Standaard: <outputDir>/docenten/. */
  outputDir?: string;
}

/**
 * Volledig opgelost configuratieobject met absolute paden.
 * Geproduceerd door resolveConfig() na het mergen van CLI-overrides.
 */
export interface ResolvedConfig {
  /** Absoluut pad naar de bronmap voor les- en quizbestanden. */
  sourcesDir: string;
  /** Absoluut pad naar de bronmap voor readers. null = overslaan. */
  readersDir: string | null;
  /** Menu module for reader PDFs; absent means the separate "Readers" module. */
  readersModule?: ReadersModuleConfig;
  /** Start every chapter of a reader PDF on a new page; absent means true. */
  readerChapterNewPage?: boolean;
  /** Absolute path to the reader cover logo. null = no logo. */
  readerCoverLogo: string | null;
  /** Absoluut pad naar de assets-map. null = geen extra assets. */
  assetsDir: string | null;
  /** Absoluut pad naar de build-uitvoermap. */
  outputDir: string;
  /** Cursusnaam voor het manifest. */
  courseName: string;
  /** Versienummer. */
  version: string;
  /** Absoluut pad naar custom CSS. null = alleen standaard-CSS. */
  customCss: string | null;
  /** Projectnaam voor het .imscc-bestand. */
  name: string;
  /** Absolute path to the Docusaurus directory. null = preview not configured. */
  docusaurusDir: string | null;
  /** Instructor manual configuration with absolute paths. null = skip. */
  teacherManual: ResolvedTeacherManualConfig | null;
  /** Definitieve quizinstellingen. */
  quiz: ResolvedQuizConfig;
  /** Definitieve diagram-instellingen (altijd ingevuld met defaults). */
  diagrams: ResolvedDiagramConfig;
  /** Automatic flashcards; absent or empty disables heading recognition. */
  flashcards?: FlashcardsConfig;
  /** Teacher page that BSO fills with versions. Absent = no teacher page. */
  teacherPage?: ResolvedTeacherPageConfig;
  /** Optional lint input selection, with absolute directory paths. */
  lint?: LintConfig;
  /** Resolved teacher dashboard configuration. null = dashboard not enabled. */
  teacherDashboard: ResolvedTeacherDashboardConfig | null;
  /** Absoluut pad naar Repo_Root. */
  repoRoot: string;
}

/**
 * Definitieve diagram-instellingen (afgeleid van BsoConfig.diagrams).
 * Alle velden zijn verplicht en altijd ingevuld met defaults na resolutie.
 */
export interface ResolvedDiagramConfig {
  /** Kroki_Endpoint. Standaard: "https://kroki.io". */
  krokiUrl: string;
  /** Outputmodus (gemapt naar remark-kroki `output`). Standaard: "img-html-base64". */
  output: "img-html-base64" | "inline-svg" | "img-base64" | "object-base64";
  /** Bij een diagramfout de build laten falen. Standaard: true. */
  failOnError: boolean;
  /** Taal voor labels/beschrijving-templates ('nl' | 'en'). Standaard: 'nl'. */
  locale: "nl" | "en";
}

/** Opgeloste quizconfiguratie. */
export interface ResolvedQuizConfig {
  /** Maximum aantal pogingen per gegenereerde toets. 0 betekent onbeperkt. */
  maxAttempts: number;
  /** Shuffle answer choices per attempt. */
  shuffleAnswers: boolean;
}

/** Resolved instructor manual configuration with absolute paths. */
export interface ResolvedTeacherManualConfig {
  /** Absolute paden naar de Markdown-bronbestanden. */
  inputFiles: string[];
  /** Bestandsnaam voor de output-PDF. */
  outputName: string;
  /** Absoluut pad naar de output-directory. */
  outputDir: string;
}

/** Resolved teacher page. */
export interface ResolvedTeacherPageConfig {
  /** Absolute path to the teacher page Markdown file. */
  path: string;
  /** True when set in the configuration; a missing explicit page is an error. */
  explicit: boolean;
}

/** Repository mapping configuration for teacher dashboard. */
export interface TeacherDashboardRepoConfig {
  /** Prefix of the repository name (e.g. "n2-ticketfaster-api"). */
  prefix: string;
  /** Human-readable label for the repository in the dashboard (e.g. "N2 TicketFaster API"). */
  label: string;
}

/** A dated course week and the assignment repositories it contains. */
export interface TeacherDashboardWeekConfig {
  /** Week label shown in the dashboard. */
  title: string;
  /** First day of the week in YYYY-MM-DD format. */
  startsOn: string;
  /** Repository prefixes assigned to this week. */
  repos: string[];
}

/** Configuration for teacher progress dashboard (GitLab work items per student). */
export interface TeacherDashboardConfig {
  /** GitLab instance URL. Standaard: "https://gitlab.com". */
  gitlabUrl?: string;
  /** GitLab group path (e.g. "2026p1-fusten"). Verplicht. */
  groupPath: string;
  /** List of subgroups (e.g. ["Arnhem", "Nijmegen"]). Standaard: []. */
  subgroups?: string[];
  /** Repository prefix and label mappings. Standaard: []. */
  repos?: TeacherDashboardRepoConfig[];
  /** Usernames of instructors whose commits should be excluded. Standaard: []. */
  teacherUsernames?: string[];
  /** Whether comment(s) on work items are required for 100% (groen). Standaard: false. */
  requireCommentsForDone?: boolean;
  /** Incomplete percentage threshold for orange status (0..100). Standaard: 10. */
  orangeThresholdPercent?: number;
  /** Incomplete percentage threshold for red status (0..100). Standaard: 50. */
  redThresholdPercent?: number;
  /** Optional course calendar mapping repositories to weeks. */
  weeks?: TeacherDashboardWeekConfig[];
  /**
   * Content module (folder name in `sourcesDir`) that holds the dashboard, directly after
   * the teacher page. Without it the dashboard gets its own "Instructor material" module.
   */
  module?: { slug: string; title?: string };
}

/** Resolved teacher dashboard configuration with all defaults applied. */
export interface ResolvedTeacherDashboardConfig {
  gitlabUrl: string;
  groupPath: string;
  subgroups: string[];
  repos: TeacherDashboardRepoConfig[];
  teacherUsernames: string[];
  requireCommentsForDone: boolean;
  orangeThresholdPercent: number;
  redThresholdPercent: number;
  weeks: TeacherDashboardWeekConfig[];
  /** Content module for the dashboard; null keeps the separate "Instructor material" module. */
  module: ReadersModuleConfig | null;
}

/** CLI-argumenten die als override kunnen dienen boven Config_File-waarden. */
export interface CliOverrides {
  /** Override voor sourcesDir (via `--sources`). */
  sources?: string;
  /** Override voor outputDir/outputPath (via `--output`). */
  output?: string;
  /** Generate only readers and the instructor manual (via `--readers-only`). */
  readersOnly?: boolean;
  /** Expliciet pad naar configuratiebestand (via `--config`). */
  config?: string;
}

/** Input selection for offline course linting. */
export interface LintConfig {
  /** Directories scanned recursively instead of sourcesDir/readersDir. */
  includeDirs?: string[];
}
