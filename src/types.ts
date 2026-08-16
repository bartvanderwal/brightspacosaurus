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
