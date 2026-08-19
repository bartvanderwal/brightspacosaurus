/**
 * MarkdownConverter: zet Markdown-bestanden om naar zelfstandige HTML-bestanden.
 * Requirements: 1.1, 1.2, 1.5, 3.5, 6.1
 */

import { ConvertOptions, ConvertResult } from "./types.ts";
import { resolve, relative, join, dirname, basename, extname } from "@std/path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

/** Regex voor het herkennen van QTI-gemarkeerde secties in Markdown. */
const QTI_SECTION_REGEX = /<!--\s*QTI\s*-->[\s\S]*?<!--\s*\/QTI\s*-->/gi;

/** Regex voor het vinden van afbeeldingsreferenties in Markdown. */
const MD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;

/** Regex voor het vinden van links naar reader-bestanden. */
const READER_LINK_REGEX = /\[([^\]]*)\]\(([^)]*(?:reader-[^)]+|plantuml-essentials)\.md)\)/g;

/**
 * Controleert of een pad binnen de repository-root valt.
 */
function assertWithinRoot(absPath: string, repoRoot: string): void {
  const rel = relative(repoRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    const err = new Error(`Pad buiten repository-root geweigerd: ${absPath} (root: ${repoRoot})`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }
}

/**
 * Verwijdert QTI-gemarkeerde secties uit Markdown-tekst.
 */
function stripQtiSections(markdown: string): string {
  return markdown.replace(QTI_SECTION_REGEX, "");
}

/**
 * Vervangt {@include: pad}-directives door de inhoud van het gerefereerde bestand.
 * Pad is relatief ten opzichte van het bronbestand. Cyclische includes worden niet
 * gedetecteerd maar diepte is begrensd op 10 niveaus.
 *
 * Requirements: 1.5
 */
async function resolveIncludes(markdown: string, sourceDir: string, depth = 0): Promise<string> {
  if (depth > 10) return markdown;
  const lines = markdown.split("\n");
  const resolved: string[] = [];
  for (const line of lines) {
    const match = line.trim().match(/^\{@include:\s*(.+?)\s*\}$/);
    if (match) {
      const includePath = join(sourceDir, match[1]);
      try {
        const content = await Deno.readTextFile(includePath);
        const nested = await resolveIncludes(content, dirname(includePath), depth + 1);
        resolved.push(nested);
      } catch {
        console.warn(`resolveIncludes: bestand niet gevonden: ${includePath}`);
        resolved.push(line);
      }
    } else {
      resolved.push(line);
    }
  }
  return resolved.join("\n");
}

/**
 * Vindt alle relatieve afbeeldingspaden in Markdown-tekst.
 */
function findRelativeImages(markdown: string): string[] {
  const images: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MD_IMAGE_REGEX.source, MD_IMAGE_REGEX.flags);
  while ((match = regex.exec(markdown)) !== null) {
    const imgPath = decodeURIComponent(match[2]);
    if (!imgPath.startsWith("http://") && !imgPath.startsWith("https://") && !imgPath.startsWith("/")) {
      images.push(imgPath);
    }
  }
  return images;
}

/**
 * Converteert links naar reader-Markdown-bestanden naar PDF-links in de readers/-map.
 * Herkent links naar bestanden met prefix `reader-` of naam `plantuml-essentials.md`.
 * Vervangt de extensie `.md` door `.pdf` en normaliseert het pad naar `../readers/`.
 *
 * Requirements: 8.5
 */
export function convertReaderLinks(markdown: string): string {
  return markdown.replace(READER_LINK_REGEX, (_match, text, href) => {
    const pdfHref = href.replace(/\.md$/, ".pdf").replace(/^(?:\.\.\/)*/, "../readers/");
    return `[${text}](${pdfHref})`;
  });
}

/** Pad naar het gedeelde CSS-bestand (relatief aan deze module). */
const CONTENT_CSS_PATH = new URL("../assets/brightspacosaurus.css", import.meta.url);

/** Cache voor het ingelezen CSS (eenmalig per proces). */
let _contentCssCache: string | null = null;

/**
 * Leest het gedeelde content-CSS in (gecached).
 */
async function getContentCss(): Promise<string> {
  if (_contentCssCache === null) {
    _contentCssCache = await Deno.readTextFile(CONTENT_CSS_PATH);
  }
  return _contentCssCache;
}

/**
 * Wikkelt HTML-body in een volledig HTML-document met lang="nl", UTF-8,
 * HAN-huisstijl CSS en Google Fonts link.
 * Optioneel wordt een custom CSS-bestand ingelined naast de standaard-CSS.
 */
async function wrapHtml(body: string, title: string, version: string, customCssPath?: string): Promise<string> {
  const css = await getContentCss();
  let customCssBlock = "";
  if (customCssPath) {
    try {
      const customCss = await Deno.readTextFile(customCssPath);
      customCssBlock = `\n/* Custom CSS */\n${customCss}`;
    } catch {
      // Custom CSS-bestand niet gevonden — doorgaan zonder
    }
  }
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<style>
${css}${customCssBlock}
.bss-version-badge {
  position: absolute;
  top: 6px;
  right: 12px;
  font-size: 11px;
  color: #bbb;
  font-family: monospace;
  z-index: 999;
  pointer-events: none;
  user-select: none;
}
</style>
</head>
<body>
<div class="bss-version-badge">v${escapeHtml(version)}</div>
<div class="brightspace-content">
${body}
</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** unified-processor voor Markdown → HTML (remark → rehype), met GFM-ondersteuning voor tabellen, strikethrough en taaklijsten. */
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

/**
 * Converteert een Markdown-bestand naar een zelfstandig HTML-bestand.
 *
 * @param options - Conversieopties
 * @returns Pad naar het gegenereerde HTML-bestand en gekopieerde afbeeldingen
 * @throws Fout met exitCode 3 als het bronbestand buiten de repository-root valt
 */
export async function convertMarkdown(options: ConvertOptions): Promise<ConvertResult> {
  const repoRoot = resolve(options.repoRoot);
  const sourcePath = resolve(options.sourcePath);
  const outputDir = resolve(options.outputDir);

  assertWithinRoot(sourcePath, repoRoot);

  let markdown: string;
  try {
    markdown = await Deno.readTextFile(sourcePath);
  } catch {
    const err = new Error(`Bronbestand niet gevonden: ${sourcePath}`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }

  const sourceDir = dirname(sourcePath);
  const includedMarkdown = await resolveIncludes(markdown, sourceDir);
  const cleanedMarkdown = stripQtiSections(includedMarkdown);
  const convertedMarkdown = convertReaderLinks(cleanedMarkdown);
  const relativeImages = findRelativeImages(convertedMarkdown);

  const relFromRoot = relative(repoRoot, sourcePath);
  const htmlFileName = basename(sourcePath, extname(sourcePath)) + ".html";
  const relDir = dirname(relFromRoot);
  const outputSubDir = join(outputDir, relDir);
  const outputPath = join(outputSubDir, htmlFileName);

  await Deno.mkdir(outputSubDir, { recursive: true });

  const copiedImages: string[] = [];

  for (const imgRelPath of relativeImages) {
    const imgAbsSource = resolve(sourceDir, imgRelPath);
    const imgOutputPath = join(outputDir, dirname(relFromRoot), imgRelPath);

    await Deno.mkdir(dirname(imgOutputPath), { recursive: true });

    try {
      await Deno.copyFile(imgAbsSource, imgOutputPath);
      copiedImages.push(imgOutputPath);
    } catch {
      // Afbeelding niet gevonden — laat de referentie intact maar kopieer niet
    }
  }

  const htmlBody = String(await processor.process(convertedMarkdown));
  const title = basename(sourcePath, extname(sourcePath));
  const version = options.version ?? "?";
  const fullHtml = await wrapHtml(htmlBody, title, version, options.customCssPath);

  await Deno.writeTextFile(outputPath, fullHtml);

  return { outputPath, copiedImages };
}
