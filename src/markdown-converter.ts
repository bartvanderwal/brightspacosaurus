/**
 * MarkdownConverter: converts Markdown files to standalone HTML files.
 * Requirements: 1.1, 1.2, 1.5, 3.5, 6.1
 */

import { ConvertOptions, ConvertResult } from "./types.ts";
import { loadAssetText } from "./assets.ts";
import { resolve, relative, join, dirname, basename, extname } from "@std/path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeExternalLinks from "rehype-external-links";
import rehypeStringify from "rehype-stringify";

/** Regex for recognizing QTI-marked sections in Markdown. */
const QTI_SECTION_REGEX = /<!--\s*QTI\s*-->[\s\S]*?<!--\s*\/QTI\s*-->/gi;

/** Regex for finding image references in Markdown. */
const MD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;

/** Regex for finding links to reader files. */
const READER_LINK_REGEX = /\[([^\]]*)\]\(([^)]*(?:reader-[^)]+|plantuml-essentials)\.md)\)/g;

/**
 * Checks whether a path is within the repository root.
 */
function assertWithinRoot(absPath: string, repoRoot: string): void {
  const rel = relative(repoRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    const err = new Error(`Path outside repository root rejected: ${absPath} (root: ${repoRoot})`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }
}

/**
 * Removes QTI-marked sections from Markdown text.
 */
function stripQtiSections(markdown: string): string {
  return markdown.replace(QTI_SECTION_REGEX, "");
}

/**
 * Replaces {@include: path} directives with the content of the referenced file.
 * The path is relative to the source file. Cyclic includes are not
 * detected but depth is bounded at 10 levels.
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
        console.warn(`resolveIncludes: file not found: ${includePath}`);
        resolved.push(line);
      }
    } else {
      resolved.push(line);
    }
  }
  return resolved.join("\n");
}

/**
 * Finds all relative image paths in Markdown text.
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
 * Converts links to reader Markdown files into PDF links in the readers/ directory.
 * Recognizes links to files with the prefix `reader-` or the name `plantuml-essentials.md`.
 * Replaces the `.md` extension with `.pdf` and normalizes the path to `../readers/`.
 *
 * Requirements: 8.5
 */
export function convertReaderLinks(markdown: string): string {
  return markdown.replace(READER_LINK_REGEX, (_match, text, href) => {
    const pdfHref = href.replace(/\.md$/, ".pdf").replace(/^(?:\.\.\/)*/, "../readers/");
    return `[${text}](${pdfHref})`;
  });
}

/**
 * Reads the shared content CSS (cached via loadAssetText).
 */
async function getContentCss(): Promise<string> {
  return await loadAssetText("brightspacosaurus.css");
}

/**
 * Wraps the HTML body in a full HTML document with lang="nl", UTF-8,
 * HAN house-style CSS and a Google Fonts link.
 * Optionally a custom CSS file is inlined alongside the default CSS.
 */
async function wrapHtml(body: string, title: string, version: string, customCssPath?: string): Promise<string> {
  const css = await getContentCss();
  let customCssBlock = "";
  if (customCssPath) {
    try {
      const customCss = await Deno.readTextFile(customCssPath);
      customCssBlock = `\n/* Custom CSS */\n${customCss}`;
    } catch {
      // Custom CSS file not found — continue without it
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
.bso-version-badge {
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
<div class="bso-version-badge">v${escapeHtml(version)}</div>
<div class="brightspace-content">
${body}
</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** unified processor for Markdown → HTML (remark → rehype), with GFM support for tables, strikethrough and task lists. */
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeExternalLinks, {
    target: "_blank",
    rel: ["noopener", "noreferrer"],
    // Only real external links (http/https); relative/internal links left untouched
    protocols: ["http", "https"],
  })
  .use(rehypeStringify);

/**
 * Converts a Markdown file to a standalone HTML file.
 *
 * @param options - Conversion options
 * @returns Path to the generated HTML file and copied images
 * @throws Error with exitCode 3 if the source file is outside the repository root
 */
export async function convertMarkdown(options: ConvertOptions): Promise<ConvertResult> {
  const repoRoot = resolve(options.repoRoot);
  const sourcePath = resolve(options.sourcePath);
  const outputDir = resolve(options.outputDir);
  const baseDir = options.baseDir ? resolve(options.baseDir) : repoRoot;

  assertWithinRoot(sourcePath, repoRoot);

  let markdown: string;
  try {
    markdown = await Deno.readTextFile(sourcePath);
  } catch {
    const err = new Error(`Source file not found: ${sourcePath}`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }

  const sourceDir = dirname(sourcePath);
  const includedMarkdown = await resolveIncludes(markdown, sourceDir);
  const cleanedMarkdown = stripQtiSections(includedMarkdown);
  const convertedMarkdown = convertReaderLinks(cleanedMarkdown);
  const relativeImages = findRelativeImages(convertedMarkdown);

  const relFromBase = relative(baseDir, sourcePath);
  const htmlFileName = basename(sourcePath, extname(sourcePath)) + ".html";
  const relDir = dirname(relFromBase);
  const outputSubDir = join(outputDir, relDir);
  const outputPath = join(outputSubDir, htmlFileName);

  await Deno.mkdir(outputSubDir, { recursive: true });

  const copiedImages: string[] = [];

  for (const imgRelPath of relativeImages) {
    const imgAbsSource = resolve(sourceDir, imgRelPath);
    const imgOutputPath = join(outputDir, dirname(relFromBase), imgRelPath);

    await Deno.mkdir(dirname(imgOutputPath), { recursive: true });

    try {
      await Deno.copyFile(imgAbsSource, imgOutputPath);
      copiedImages.push(imgOutputPath);
    } catch {
      // Image not found — leave the reference intact but do not copy
    }
  }

  const htmlBody = String(await processor.process(convertedMarkdown));
  const title = basename(sourcePath, extname(sourcePath));
  const version = options.version ?? "?";
  const fullHtml = await wrapHtml(htmlBody, title, version, options.customCssPath);

  await Deno.writeTextFile(outputPath, fullHtml);

  return { outputPath, copiedImages };
}
