/**
 * Converts lesson Markdown files to standalone Brightspace HTML files.
 *
 * This module owns the unified/remark/rehype pipeline, reader-link conversion,
 * asset copying and optional diagram rendering for lesson pages.
 *
 * @module
 */

import type { ConvertOptions, ConvertResult } from "./types.ts";
import { loadAssetText } from "./assets.ts";
import { basename, dirname, extname, join, relative, resolve } from "@std/path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkDirective from "remark-directive";
import { remarkFlashcards } from "./flashcards.ts";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeExternalLinks from "rehype-external-links";
import rehypePrismPlus from "rehype-prism-plus";
import rehypeStringify from "rehype-stringify";
import {
  DiagramError,
  diagramIssueToError,
  formatDiagramWarning,
  shouldFallbackDiagramError,
  toDiagramError,
  withDiagramRendering,
} from "./diagram-renderer.ts";
import { rehypeBrightspaceDiagramAdapter } from "./diagram-adapter.ts";
import { detectDiagramIssues } from "./diagram-validation.ts";
import { expandIncludes, parseIncludeTarget } from "./includes.ts";

/** Regex for recognizing QTI-marked sections in Markdown. */
const QTI_SECTION_REGEX = /<!--\s*QTI\s*-->[\s\S]*?<!--\s*\/QTI\s*-->/gi;

/** Regex for finding image references in Markdown. */
const MD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;

/** Regex for finding links to reader files. */
const READER_LINK_REGEX =
  /\[([^\]]*)\]\(([^)]*(?:reader-[^)]+|plantuml-essentials)\.md)\)/g;

/**
 * Regex for remaining internal .md links (lesson-to-lesson), after reader
 * links have already been converted to .pdf. Excludes image syntax (`![...]`)
 * via the negative lookbehind.
 */
const INTERNAL_MD_LINK_REGEX =
  /(?<!!)\[([^\]]*)\]\(([^()\s]+\.md(?:#[^()\s]*)?)\)/g;

/**
 * Checks whether a path is within the repository root.
 */
function assertWithinRoot(absPath: string, repoRoot: string): void {
  const rel = relative(repoRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    const err = new Error(
      `Path outside repository root rejected: ${absPath} (root: ${repoRoot})`,
    );
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

export { parseIncludeTarget };

/** Requirements: 1.5 */
function resolveIncludes(markdown: string, sourceDir: string): string {
  return expandIncludes(markdown, sourceDir, {
    resolve: join,
    dirname,
    readFile: (path) => {
      try {
        return Deno.readTextFileSync(path);
      } catch {
        return null;
      }
    },
    warn: console.warn,
  });
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
    if (
      !imgPath.startsWith("http://") && !imgPath.startsWith("https://") &&
      !imgPath.startsWith("/")
    ) {
      images.push(imgPath);
    }
  }
  return images;
}

/**
 * Converts links to reader Markdown files into PDF links in the package-root
 * `readers/` directory. Recognizes links to files with the prefix `reader-` or
 * the name `plantuml-essentials.md`; external URLs are left untouched.
 *
 * @param htmlDepth - Directory depth of the generated HTML page below the
 *   package root, e.g. 2 for `content/week-1/lesson.html`.
 *
 * Requirements: 8.5
 */
export function convertReaderLinks(markdown: string, htmlDepth = 1): string {
  return markdown.replace(READER_LINK_REGEX, (match, text, href) => {
    if (/^(?:https?:)?\/\//i.test(href)) return match;
    const pdfName = basename(href).replace(/\.md$/, ".pdf");
    return `[${text}](${"../".repeat(htmlDepth)}readers/${pdfName})`;
  });
}

/**
 * Converts internal Markdown links to relative links to the generated HTML.
 * The package mirrors the source tree under `content/`, and Brightspace
 * resolves relative links against the page's file location. Reader links are
 * converted first and therefore remain PDF links; external links are left
 * untouched.
 *
 * Issues: #7, #8
 */
export function convertInternalMdLinks(
  markdown: string,
  sourcePath: string,
): string {
  const sourceDir = dirname(sourcePath);
  return markdown.replace(INTERNAL_MD_LINK_REGEX, (match, text, href) => {
    if (/^(?:https?:)?\/\//i.test(href)) return match;

    const hashIndex = href.indexOf("#");
    const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const anchor = hashIndex >= 0 ? href.slice(hashIndex) : "";
    const targetPath = resolve(sourceDir, pathPart);
    const htmlPath = relative(sourceDir, targetPath).replace(/\\/g, "/")
      .replace(/\.md$/i, ".html");
    return `[${text}](${htmlPath}${anchor})`;
  });
}

/**
 * Reads the shared content CSS (cached via loadAssetText).
 */
async function getContentCss(): Promise<string> {
  return await loadAssetText("brightspacosaurus.css");
}

/**
 * Inline script that adds a copy button to every code block. No external
 * dependencies or user-controlled data are involved, so inlining is safe.
 *
 * Issue: #16
 */
const COPY_BUTTON_SCRIPT = `<script>
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('pre code').forEach(function (codeBlock) {
    var pre = codeBlock.parentElement;
    if (!pre || pre.dataset.bsoCopyWrapped) return;
    pre.dataset.bsoCopyWrapped = 'true';

    var wrapper = document.createElement('div');
    wrapper.className = 'bso-code-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bso-copy-btn';
    btn.textContent = 'Kopieer';
    btn.setAttribute('aria-label', 'Kopieer code');
    btn.addEventListener('click', function () {
      var text = codeBlock.innerText;
      var showCopied = function () {
        btn.textContent = 'Gekopieerd!';
        setTimeout(function () { btn.textContent = 'Kopieer'; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopied, function () {});
      } else {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showCopied();
        } catch (_err) {
          // Clipboard unavailable — leave button as-is
        }
        document.body.removeChild(textarea);
      }
    });
    wrapper.appendChild(btn);
  });
});
</script>`;

/**
 * Wraps the HTML body in a full HTML document with lang="nl", UTF-8,
 * HAN house-style CSS and a Google Fonts link.
 * Optionally a custom CSS file is inlined alongside the default CSS.
 */
async function wrapHtml(
  body: string,
  title: string,
  version: string,
  packageVersion: string,
  customCssPath?: string,
): Promise<string> {
  const css = await getContentCss();
  const flashcardScript = await loadAssetText(
    "brightspacosaurus-flashcards.js",
  );
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
<div class="bso-version-badge">BSO v${escapeHtml(packageVersion)} · content v${
    escapeHtml(version)
  }</div>
<div class="brightspace-content">
${body}
</div>
${COPY_BUTTON_SCRIPT}
<script>${flashcardScript}</script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  );
}

/** Materializes base64 SVG images so Brightspace does not have to preserve data URIs. */
async function materializeDiagramImages(
  html: string,
  outputSubDir: string,
): Promise<{ html: string; imagePaths: string[] }> {
  const dataUriRegex = /data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g;
  const imagePaths: string[] = [];
  let diagramIndex = 0;
  let match: RegExpExecArray | null;
  let result = "";
  let lastIndex = 0;

  while ((match = dataUriRegex.exec(html)) !== null) {
    diagramIndex += 1;
    const relativePath = `images/diagrams/diagram-${diagramIndex}.svg`;
    const absolutePath = join(outputSubDir, relativePath);
    await Deno.mkdir(dirname(absolutePath), { recursive: true });
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    await Deno.writeFile(absolutePath, bytes);
    imagePaths.push(absolutePath);
    result += html.slice(lastIndex, match.index) + relativePath;
    lastIndex = match.index + match[0].length;
  }

  return {
    html: diagramIndex === 0 ? html : result + html.slice(lastIndex),
    imagePaths,
  };
}

/** Creates a Markdown → HTML processor. A fresh processor avoids cross-file state in plugins. */
function createProcessor(options: ConvertOptions, renderDiagrams = true) {
  let processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkFlashcards);

  if (renderDiagrams && options.diagrams) {
    processor = withDiagramRendering(
      processor,
      options.diagrams,
      options.sourcePath,
    );
  }

  return processor
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeBrightspaceDiagramAdapter)
    // Same Prism token classes as the Docusaurus preview (#28); unknown languages stay plain.
    .use(rehypePrismPlus, { ignoreMissing: true })
    .use(rehypeExternalLinks, {
      target: "_blank",
      rel: ["noopener", "noreferrer"],
      // Only real external links (http/https); relative/internal links left untouched
      protocols: ["http", "https"],
    })
    .use(rehypeStringify, { allowDangerousHtml: true });
}

async function processMarkdownBody(
  markdown: string,
  options: ConvertOptions,
): Promise<string> {
  if (options.diagrams) {
    const [issue] = detectDiagramIssues(markdown, options.sourcePath);
    if (issue) {
      const diagramError = diagramIssueToError(issue);
      if (!shouldFallbackDiagramError(diagramError, options.diagrams)) {
        throw diagramError;
      }
      console.warn(formatDiagramWarning(diagramError));
      return String(await createProcessor(options, false).process(markdown));
    }
  }

  try {
    return String(await createProcessor(options).process(markdown));
  } catch (error) {
    if (!options.diagrams) throw error;
    const diagramError = error instanceof DiagramError
      ? error
      : toDiagramError(error, options.sourcePath);
    if (!shouldFallbackDiagramError(diagramError, options.diagrams)) {
      throw diagramError;
    }
    console.warn(formatDiagramWarning(diagramError));
    return String(await createProcessor(options, false).process(markdown));
  }
}

/**
 * Converts a Markdown file to a standalone HTML file.
 *
 * @param options - Conversion options
 * @returns Path to the generated HTML file and copied images
 * @throws Error with exitCode 3 if the source file is outside the repository root
 */
export async function convertMarkdown(
  options: ConvertOptions,
): Promise<ConvertResult> {
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
  const includedMarkdown = resolveIncludes(markdown, sourceDir);
  const cleanedMarkdown = stripQtiSections(includedMarkdown);
  // 1 for content/ plus the page's subdirectories below baseDir.
  const htmlDepth = 1 +
    relative(baseDir, sourceDir).split(/[\\/]/).filter((part) =>
      part && part !== "."
    ).length;
  const convertedMarkdown = convertInternalMdLinks(
    convertReaderLinks(cleanedMarkdown, htmlDepth),
    sourcePath,
  );
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

  const htmlBody = await processMarkdownBody(convertedMarkdown, options);
  const materializedDiagrams = await materializeDiagramImages(
    htmlBody,
    outputSubDir,
  );
  copiedImages.push(...materializedDiagrams.imagePaths);
  const title = basename(sourcePath, extname(sourcePath));
  const version = options.version ?? "?";
  const fullHtml = await wrapHtml(
    materializedDiagrams.html,
    title,
    version,
    options.packageVersion ?? "?",
    options.customCssPath,
  );

  await Deno.writeTextFile(outputPath, fullHtml);

  return { outputPath, copiedImages };
}
