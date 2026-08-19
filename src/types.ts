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
  /** Absoluut pad naar een custom CSS-bestand. Wordt naast de standaard-CSS opgenomen. */
  customCssPath?: string;
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
export interface BssConfig {
  /** Cursusnaam voor het manifest. Verplicht. */
  courseName: string;
  /** Versienummer (gebruikt in .imscc-bestandsnaam en HTML-badge). Verplicht. */
  version: string;
  /** Bronmap voor lespagina's en quizzen (relatief aan Repo_Root). Verplicht. */
  sourcesDir: string;
  /** Bronmap voor readers (relatief aan Repo_Root). Optioneel. */
  readersDir?: string;
  /** Map met statische assets (relatief aan Repo_Root). Optioneel. */
  assetsDir?: string;
  /** Build-uitvoermap (relatief aan Repo_Root). Standaard: "build/brightspace". */
  outputDir?: string;
  /** Pad naar een custom CSS-bestand (relatief aan Repo_Root). Optioneel. */
  customCss?: string;
  /** Projectnaam voor het .imscc-bestand (standaard: afgeleid van courseName). */
  name?: string;
  /** Configuratie voor docentenhandleiding-generatie. Optioneel. */
  docentenHandleiding?: DocentenHandleidingConfig;
}

/** Configuratie voor de docentenhandleiding-PDF-generatie. */
export interface DocentenHandleidingConfig {
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
  /** Docentenhandleiding-configuratie met absolute paden. null = overslaan. */
  docentenHandleiding: ResolvedDocentenConfig | null;
  /** Absoluut pad naar Repo_Root. */
  repoRoot: string;
}

/** Opgeloste docentenhandleiding-configuratie met absolute paden. */
export interface ResolvedDocentenConfig {
  /** Absolute paden naar de Markdown-bronbestanden. */
  inputFiles: string[];
  /** Bestandsnaam voor de output-PDF. */
  outputName: string;
  /** Absoluut pad naar de output-directory. */
  outputDir: string;
}

/** CLI-argumenten die als override kunnen dienen boven Config_File-waarden. */
export interface CliOverrides {
  /** Override voor sourcesDir (via `--sources`). */
  sources?: string;
  /** Override voor outputDir/outputPath (via `--output`). */
  output?: string;
  /** Alleen readers en docentenhandleiding genereren (via `--readers-only`). */
  readersOnly?: boolean;
  /** Expliciet pad naar configuratiebestand (via `--config`). */
  config?: string;
}
