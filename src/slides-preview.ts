import {
  basename,
  dirname,
  globToRegExp,
  isAbsolute,
  join,
  relative,
  resolve,
} from "@std/path";
import {
  deckMarkerConflict,
  deckProblem,
  expandIncludesOnce,
  isSlideDeck,
} from "./includes.ts";
import {
  type DeckLink,
  deckTopicName,
  findDeckLinks,
  rewriteLinkTargets,
} from "./linked-decks.ts";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import type { ResolvedDiagramConfig, SlidesConfig } from "./types.ts";
import { resolveDiagramsConfig } from "./diagram-config.ts";
import { loadAssetBytes, loadAssetText } from "./assets.ts";
import { DEFAULT_MAX_IMAGE_WIDTH, shrinkImage } from "./image-shrink.ts";
import {
  generateLessonSlides,
  generateNestedAppendix,
  stripTitlePrefix,
} from "./lesson-slides.ts";
import {
  dropEmptySlideSeparators,
  headingDividerLevels,
} from "./slide-separators.ts";
import { convertDeckToPptx } from "./pptx/mod.ts";

export type { SlidesConfig } from "./types.ts";

/** Injectable command boundary, so selection and rewriting can be tested offline. */
export type SlidesRunner = (args: string[], cwd: string) => Promise<void>;

/** Neutral on purpose: no school year or period; a course sets its own text. */
const DEFAULT_DISCLAIMER = "Preview";

function within(path: string, root: string): void {
  const rel = relative(root, path);
  if (
    isAbsolute(rel) || rel === ".." ||
    rel.startsWith(`..${Deno.build.os === "windows" ? "\\" : "/"}`)
  ) {
    throw new Error(
      `Slides preview: path outside root rejected: ${path} (root: ${root})`,
    );
  }
}

function relativePath(path: string, label: string): void {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
    throw new Error(
      `Slides preview: ${label} must be a nonempty relative path without '..': ${path}`,
    );
  }
}

async function confined(path: string, root: string): Promise<void> {
  within(path, root);
  let existing = path;
  while (true) {
    try {
      within(await Deno.realPath(existing), root);
      return;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
}

async function collect(
  root: string,
  excluded: string,
  tools: string,
): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const path = join(dir, entry.name);
      if (
        entry.isSymlink || path === excluded || path === tools ||
        entry.name === ".git" || entry.name === ".github" ||
        entry.name === "node_modules"
      ) continue;
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile && /\.md$/i.test(entry.name)) files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

/**
 * Deliberately conservative: only an unquoted top-level YAML boolean enables
 * slide-deck recognition. `slides: true` is the semantic spelling; `marp: true`
 * remains supported for existing slide decks and is normalized for the Marp CLI.
 * Nested keys, block scalars, quoted "true", and ordinary Markdown do not.
 */
function frontmatter(
  text: string,
): { header: string; body: string } | undefined {
  if (deckProblem(text)) return undefined;
  const match = text.match(FRONT_MATTER)!;
  return {
    header: match[0].replace(/^slides[ \t]*:.*$/m, "marp: true"),
    body: text.slice(match[0].length),
  };
}

const FRONT_MATTER = /^(?:\uFEFF)?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

function setTheme(header: string, theme: string): string {
  if (/^theme[ \t]*:/m.test(header)) {
    return header.replace(/^theme[ \t]*:.*$/m, `theme: ${theme}`);
  }
  return header.replace(/\n---[ \t]*(?:\n|$)/, `\ntheme: ${theme}\n---\n`);
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

async function imageUrl(
  url: string,
  source: string,
  root: string,
  maxWidth = 0,
): Promise<string> {
  if (/^(?:https?:|data:|#|\/\/)/i.test(url)) return url;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
    throw new Error(`Slides preview: unsupported image URL: ${url}`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.split(/[?#]/)[0]);
  } catch {
    throw new Error(`Slides preview: invalid image URL in ${source}: ${url}`);
  }
  const path = resolve(dirname(source), decoded);
  await confined(path, root);
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[extension];
  if (!mime) {
    throw new Error(
      `Slides preview: unsupported local image in ${source}: ${url}`,
    );
  }
  try {
    const bytes = shrinkImage(await Deno.readFile(path), mime, maxWidth);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (error) {
    throw new Error(
      `Slides preview: cannot read image '${url}' in ${source}: ${error}`,
    );
  }
}

interface ImageNode {
  type: string;
  url?: string;
  alt?: string | null;
  title?: string | null;
  identifier?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: ImageNode[];
}

function styleFields(
  text: string,
  allowIndent: boolean,
): { start: number; end: number }[] {
  const lines = text.split("\n");
  const ranges: { start: number; end: number }[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const field = line.match(/^([ \t]*)(?:_?style)[ \t]*:[ \t]*(.*)$/);
    if (
      field && (allowIndent || !field[1]) &&
      (!ranges.length || offset >= ranges[ranges.length - 1].end)
    ) {
      let end = offset + line.length;
      if (/^[|>]/.test(field[2])) {
        let next = i + 1;
        while (next < lines.length) {
          const continuation = lines[next];
          const indent = continuation.match(/^[ \t]*/)?.[0].length ?? 0;
          if (continuation.trim() && indent <= field[1].length) break;
          end += 1 + continuation.length;
          next++;
        }
      }
      ranges.push({ start: offset, end });
    }
    offset += line.length + 1;
  }
  return ranges;
}

async function embedImages(
  text: string,
  source: string,
  root: string,
  svgImages: Map<string, string>,
  maxWidth = 0,
): Promise<string> {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"])
    .parse(text) as ImageNode;
  const edits: { start: number; end: number; value: string }[] = [];
  const definitions = new Map<string, ImageNode>();
  const imageCache = new Map<string, Promise<string>>();
  function definitionsIn(node: ImageNode): void {
    if (
      node.type === "definition" && node.identifier &&
      !definitions.has(node.identifier)
    ) {
      definitions.set(node.identifier, node);
    }
    node.children?.forEach(definitionsIn);
  }
  definitionsIn(tree);
  function embeddedUrl(url: string): Promise<string> {
    if (!imageCache.has(url)) {
      imageCache.set(url, imageUrl(url, source, root, maxWidth));
    }
    return imageCache.get(url)!;
  }
  function markdownImageUrl(url: string): string {
    // Marp's Markdown parser rejects every SVG data URL, backgrounds included
    // (the image then shows as text). SVGs get a placeholder name, which is
    // replaced by the data URL in the rendered HTML (`src` and CSS `url()`).
    if (!url.startsWith("data:image/svg+xml;base64,")) return url;
    const existing = [...svgImages].find(([, value]) => value === url)?.[0];
    if (existing) return existing;
    const placeholder = `bso-embedded-svg-${svgImages.size}.svg`;
    svgImages.set(placeholder, url);
    return placeholder;
  }
  async function cssUrls(
    fragment: string,
    start: number,
    yamlStyle = false,
  ): Promise<void> {
    let scan = fragment;
    let offsets: number[] | undefined;
    const quote = yamlStyle
      ? fragment.match(/^[ \t]*_?style[ \t]*:[ \t]*(["'])/)?.[1]
      : undefined;
    if (quote) {
      // Decode YAML quote escaping for matching, but edit the original source spans.
      scan = "";
      offsets = [0];
      for (let i = 0; i < fragment.length;) {
        let char = fragment[i++];
        if (
          (quote === '"' && char === "\\" &&
            (fragment[i] === '"' || fragment[i] === "\\")) ||
          (quote === "'" && char === "'" && fragment[i] === "'")
        ) char = fragment[i++];
        scan += char;
        offsets.push(i);
      }
    }
    for (
      const match of scan.matchAll(
        /url\(\s*(?:(["'])(.*?)\1|([^)\s]+))\s*\)/gi,
      )
    ) {
      const original = match[2] ?? match[3];
      const url = await embeddedUrl(original);
      if (url === original) continue;
      const from = offsets?.[match.index!] ?? match.index!;
      const to = offsets?.[match.index! + match[0].length] ??
        match.index! + match[0].length;
      edits.push({
        start: start + from,
        end: start + to,
        value: `url(${url})`,
      });
    }
  }
  async function visit(node: ImageNode): Promise<void> {
    // Rewrite only actual styles, never URLs mentioned in notes or metadata.
    if (node.type === "yaml" || node.type === "html") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        const fragment = text.slice(start, end);
        if (node.type === "yaml") {
          for (const range of styleFields(fragment, false)) {
            await cssUrls(
              fragment.slice(range.start, range.end),
              start + range.start,
              true,
            );
          }
        } else {
          const comments = [...fragment.matchAll(/<!--([\s\S]*?)-->/g)];
          const styles = [
            ...fragment.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi),
          ]
            .filter((style) =>
              !comments.some((comment) =>
                style.index! >= comment.index! &&
                style.index! < comment.index! + comment[0].length
              )
            );
          for (const style of styles) {
            await cssUrls(
              style[1],
              start + style.index! + style[0].indexOf(">") + 1,
            );
          }
          for (const comment of comments) {
            if (
              styles.some((style) =>
                comment.index! >= style.index! &&
                comment.index! < style.index! + style[0].length
              )
            ) continue;
            if (!/^[A-Za-z_][\w-]*[ \t]*:/.test(comment[1].trimStart())) {
              continue;
            }
            for (const range of styleFields(comment[1], true)) {
              await cssUrls(
                comment[1].slice(range.start, range.end),
                start + comment.index! + 4 + range.start,
                true,
              );
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) await visit(child);
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (node.type === "definition") {
      edits.push({ start, end, value: "" });
    } else if (node.type === "image" && node.url) {
      const url = markdownImageUrl(await embeddedUrl(node.url));
      if (url !== node.url) {
        edits.push({
          start,
          end,
          value: `![${(node.alt ?? "").replace(/[[\]\\]/g, "\\$&")}](<${url}>${
            node.title ? ` ${JSON.stringify(node.title)}` : ""
          })`,
        });
      }
    } else if (
      node.type === "imageReference" || node.type === "linkReference"
    ) {
      const definition = definitions.get(node.identifier!);
      if (!definition?.url) return;
      const url = node.type === "imageReference"
        ? markdownImageUrl(await embeddedUrl(definition.url))
        : definition.url;
      const title = definition.title
        ? ` ${JSON.stringify(definition.title)}`
        : "";
      let label = (node.alt ?? "").replace(/[[\]\\]/g, "\\$&");
      if (node.type === "linkReference") {
        const labelStart = node.children?.[0]?.position?.start.offset;
        const labelEnd = node.children?.at(-1)?.position?.end.offset;
        label = labelStart !== undefined && labelEnd !== undefined
          ? text.slice(labelStart, labelEnd)
          : "";
        // Fold nested image edits into this link's replacement rather than overlap them.
        if (labelStart !== undefined && labelEnd !== undefined) {
          for (
            const edit of edits.filter((edit) =>
              edit.start >= labelStart && edit.end <= labelEnd
            ).sort((a, b) => b.start - a.start)
          ) {
            label = label.slice(0, edit.start - labelStart) + edit.value +
              label.slice(edit.end - labelStart);
            edits.splice(edits.indexOf(edit), 1);
          }
        }
      }
      edits.push({
        start,
        end,
        value: `${
          node.type === "imageReference" ? "!" : ""
        }[${label}](<${url}>${title})`,
      });
    }
  }
  await visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
  }
  return text;
}

const FAVICON_TYPES: Record<string, string> = {
  ico: "image/x-icon",
  png: "image/png",
  svg: "image/svg+xml",
};

/**
 * The favicon of the Docusaurus app, by convention `static/img/favicon.*`, so
 * the slides tab shows the same icon as the course site. Undefined when there
 * is none. Preview only: the `.imscc` has no favicon for a topic.
 */
export async function findDocusaurusFavicon(
  docusaurusDir: string,
): Promise<string | undefined> {
  for (const extension of Object.keys(FAVICON_TYPES)) {
    const path = join(docusaurusDir, "static", "img", `favicon.${extension}`);
    const stat = await Deno.stat(path).catch(() => undefined);
    if (stat?.isFile) return path;
  }
  return undefined;
}

/** Adds the favicon to a slides page as an embedded `<link rel="icon">`. */
export function withFavicon(
  html: string,
  favicon: Uint8Array,
  path: string,
): string {
  const type = FAVICON_TYPES[path.split(".").at(-1) ?? ""] ?? "image/png";
  let binary = "";
  for (const byte of favicon) binary += String.fromCharCode(byte);
  const link = `<link rel="icon" type="${type}" href="data:${type};base64,${
    btoa(binary)
  }">`;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${link}</head>`)
    : link + html;
}

const BACK_CONTROLS_ID = "bso-slides-back";

/**
 * Preview only: a small hint in the corner of a slide deck that says Esc (or
 * Alt/Option+P again) goes back to the lesson, and the key handler that does
 * it, plus an Esc button in Marp's on-screen controller (the HUD that appears on
 * mouse movement). Going back is the browser's own history step (`history.back()`), the same
 * as the Back button (ADR 022); in full screen the browser takes the first Esc.
 * The export removes it again (`stripBackControls`).
 */
export function withBackControls(html: string, label: string): string {
  const text = label.replace(/[<>&"]/g, "");
  const controls =
    `<div id="${BACK_CONTROLS_ID}"><style>#${BACK_CONTROLS_ID} span{position:fixed;left:.8rem;bottom:.6rem;z-index:50;padding:.1rem .55rem;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font:12px/1.5 system-ui,sans-serif;pointer-events:none}@media print{#${BACK_CONTROLS_ID} span{display:none}}</style><span><b>Esc</b> ${text}</span><script>document.addEventListener("keydown",function(e){var alt=e.altKey&&e.code==="KeyP"&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey;var esc=e.key==="Escape"&&!document.fullscreenElement;if((!alt&&!esc)||e.defaultPrevented||history.length<2||document.body.getAttribute("data-bespoke-view"))return;e.preventDefault();e.stopPropagation();history.back()},true);(function(){function add(){var osc=document.querySelector(".bespoke-marp-osc");if(!osc||osc.querySelector("[data-bespoke-marp-osc=back]"))return;var b=document.createElement("button");b.type="button";b.setAttribute("data-bespoke-marp-osc","back");b.title="${text}";b.setAttribute("aria-label","${text}");b.textContent="Esc \\u2715";b.style.cssText="width:auto;padding:0 10px;height:32px;line-height:32px";b.addEventListener("click",function(){if(history.length>1)history.back()});osc.appendChild(b)}new MutationObserver(add).observe(document.body,{childList:true,subtree:true});add()})()</script></div>`;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${controls}</body>`)
    : html + controls;
}

/** Removes the preview-only back hint and key handler, so they never reach the `.imscc`. */
export function stripBackControls(html: string): string {
  return html.replace(
    new RegExp(`<div id="${BACK_CONTROLS_ID}">[\\s\\S]*?</script></div>`),
    "",
  );
}

/** First line of the title (`h1`) of a slide section, as text. */
function slideTitle(section: string): string {
  return (section.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
    .replace(/<[^>]*>/g, "").trim();
}

/**
 * The default layout of a generated or manual deck: the title sits at a fixed
 * place near the top instead of moving with the amount of content, and a small
 * logo (the course logo, else the BSO logo) sits bottom right, with the page
 * number as `3 / 9` next to it. The total leaves out appendix slides (a slide
 * titled `Bijlage ...` or `Appendix ...` and all slides after it); those show
 * only their own number. Title slides (`lead`) keep their centred layout.
 * Applied only when the course has no theme of its own, so a theme keeps its
 * layout.
 */
export function withSlideLayout(html: string, logoUrl: string): string {
  // Marp scopes its theme CSS with an id selector, so these rules need !important.
  const style =
    `<style id="bso-slide-layout">section:not(.lead){align-content:start!important;padding-top:52px!important}section[data-marpit-pagination]::after{right:96px!important;background:rgba(255,255,255,.85);padding:0 .3em;border-radius:.2em;content:attr(data-marpit-pagination) " / " attr(data-bso-total)!important}section[data-bso-appendix]::after{content:attr(data-marpit-pagination)!important}.bso-footer-logo{position:absolute;right:30px;bottom:22px;width:48px;height:44px;background:url(${logoUrl}) no-repeat center/contain}section.lead .bso-footer-logo{display:none}section img:not(.bso-slide-logo){max-width:100%;max-height:500px;object-fit:contain}section:has(ul,ol,table,pre) img:not(.bso-slide-logo){max-height:300px}</style>`;
  // Real slides carry a numeric id; Marp's extra sections for background images do not.
  const isSlide = (section: string) =>
    /^<section\b[^>]*\sid="\d+"/i.test(section);
  const slides = (html.match(/<section\b[\s\S]*?<\/section>/gi) ?? []).filter(
    isSlide,
  );
  const firstAppendix = slides.findIndex((section) =>
    /^(?:Bijlage|Appendix)\b/i.test(slideTitle(section))
  );
  const total = firstAppendix < 0 ? slides.length : firstAppendix;
  let index = 0;
  const withLogos = html.replace(
    /<section\b[\s\S]*?<\/section>/gi,
    (section) => {
      if (!isSlide(section)) return section;
      const appendix = firstAppendix >= 0 && index++ >= firstAppendix;
      return section.replace(
        /^<section\b/i,
        `<section data-bso-total="${total}"${
          appendix ? " data-bso-appendix" : ""
        }`,
      ).replace(
        /<\/section>$/i,
        '<span class="bso-footer-logo"></span></section>',
      );
    },
  );
  return /<\/head>/i.test(withLogos)
    ? withLogos.replace(/<\/head>/i, `${style}</head>`)
    : style + withLogos;
}

/** The BSO logo as a data URL, for slide decks of a course without a logo of its own. */
async function defaultSlideLogo(): Promise<string> {
  const bytes = await loadAssetBytes("brightspacosaurus.png");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

const PPTX_STYLE_ID = "bso-pptx-style";

/**
 * Whether a slide deck gets a `.pptx`. The slide deck's own `pptx: true | false | auto`
 * wins; `auto` (or no value) takes the course-wide `slides.pptx` setting.
 */
export function deckWantsPptx(deck: string, courseDefault = false): boolean {
  const header = deck.replace(/^\uFEFF/, "").match(
    /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/,
  )?.[1] ?? "";
  const value = header.match(
    /^pptx[ \t]*:[ \t]*["']?(\w+)["']?[ \t]*(?:#.*)?$/m,
  )?.[1];
  if (value === "true") return true;
  if (value === "false") return false;
  return courseDefault;
}

/** A link to each `.pptx` in the top corner of the slides page. */
export function withPptxLinks(html: string, names: string[]): string {
  if (!names.length) return html;
  const style =
    `<style id="${PPTX_STYLE_ID}">.bso-pptx{position:fixed;top:10px;right:12px;z-index:20;display:flex;gap:8px;font:13px sans-serif}.bso-pptx a{background:#fff;color:#0b4a8f;border:1px solid #9aa4b2;border-radius:14px;padding:3px 10px;text-decoration:none}.bso-pptx a:hover{background:#eef4fb}@media print{.bso-pptx{display:none}}</style>`;
  const links = `<nav class="bso-pptx" aria-label="Downloads">${
    names.map((name) =>
      `<a href="${escapeAttribute(name)}" download>Download pptx</a>`
    ).join("")
  }</nav>`;
  const withStyle = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${style}</head>`)
    : style + html;
  return /<\/body>/i.test(withStyle)
    ? withStyle.replace(/<\/body>/i, `${links}</body>`)
    : withStyle + links;
}

/** The names that the pptx links of a slides page point to. */
function pptxLinkNames(html: string): string[] {
  const nav = html.match(/<nav class="bso-pptx"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ??
    "";
  return [...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

function banner(value: string): string {
  const escaped = value.replace(
    /[\\'"\n\r\f<>\u2028\u2029]/g,
    (char) => `\\${char.codePointAt(0)!.toString(16)} `,
  );
  return `<style id="bso-slide-disclaimer">section::before{content:"${escaped}";position:absolute;top:8px;left:12px;right:12px;font:12px sans-serif;z-index:10;pointer-events:none;opacity:.75}</style>`;
}

async function dataImage(path: string, root: string): Promise<string> {
  const image = isAbsolute(path) ? path : resolve(root, path);
  await confined(image, root);
  const extension = image.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[extension];
  if (!mime) {
    throw new Error(`Slides preview: unsupported logo image: ${path}`);
  }
  const stat = await Deno.stat(image).catch(() => undefined);
  if (!stat?.isFile) {
    throw new Error(`Slides preview: logo is not a file: ${path}`);
  }
  const bytes = await Deno.readFile(image);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

function addLogo(html: string, logo: string): string {
  let added = false;
  return html.replace(/<section\b[^>]*>/gi, (opening) => {
    if (added) return opening;
    const classes = opening.match(/\bclass=(["'])(.*?)\1/i)?.[2].split(/\s+/);
    if (!classes?.includes("lead")) return opening;
    added = true;
    return `${opening}<img class="bso-slide-logo" src="${logo}" alt="" style="position:absolute;top:2.6rem;right:1rem;max-width:20%;max-height:15%;object-fit:contain">`;
  });
}

const runNpm: SlidesRunner = async (args, cwd) => {
  const result = await new Deno.Command("npm", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error(
      `exit ${result.code}: ${new TextDecoder().decode(result.stderr).trim()}`,
    );
  }
};

const TOOL_MANIFEST = {
  private: true,
  dependencies: { "@marp-team/marp-cli": "4.5.1" },
  overrides: { "@xmldom/xmldom": "0.9.12", katex: "0.18.2" },
};

async function prepareTools(
  tools: string,
  root: string,
  runner: SlidesRunner,
): Promise<void> {
  await confined(tools, root);
  const manifest = join(tools, "package.json");
  const lock = join(tools, "package-lock.json");
  const modules = join(tools, "node_modules");
  for (const path of [manifest, lock, modules]) await confined(path, root);
  await Deno.mkdir(tools, { recursive: true });
  const expected = JSON.stringify(TOOL_MANIFEST, null, 2) + "\n";
  try {
    const cli = join(modules, "@marp-team/marp-cli/package.json");
    const xml = join(modules, "@xmldom/xmldom/package.json");
    const katex = join(modules, "katex/package.json");
    await confined(cli, root);
    await confined(xml, root);
    await confined(katex, root);
    const cliVersion = JSON.parse(await Deno.readTextFile(cli)).version;
    const xmlVersion = JSON.parse(await Deno.readTextFile(xml)).version;
    const katexVersion = JSON.parse(await Deno.readTextFile(katex)).version;
    const locked = JSON.parse(await Deno.readTextFile(lock)).packages;
    if (
      await Deno.readTextFile(manifest) === expected &&
      cliVersion === "4.5.1" && xmlVersion === "0.9.12" &&
      katexVersion === "0.18.2" &&
      locked?.["node_modules/@marp-team/marp-cli"]?.version === "4.5.1" &&
      locked?.["node_modules/@xmldom/xmldom"]?.version === "0.9.12" &&
      locked?.["node_modules/katex"]?.version === "0.18.2"
    ) return;
  } catch (error) {
    if (
      !(error instanceof Deno.errors.NotFound) &&
      !(error instanceof SyntaxError)
    ) throw error;
  }
  await Deno.writeTextFile(manifest, expected);
  await runner([
    "install",
    "--prefix",
    tools,
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
  ], root);
  for (const [name, version] of Object.entries(TOOL_MANIFEST.overrides)) {
    const path = join(modules, name, "package.json");
    await confined(path, root);
    if (JSON.parse(await Deno.readTextFile(path)).version !== version) {
      throw new Error(
        `Slides preview: Marp tool cache did not install patched ${name} ${version}: ${tools}`,
      );
    }
  }
}

/**
 * Replaces each `plantuml` / `mermaid` fence of a generated slide deck by the SVG
 * that Kroki draws for it, as an embedded image (so Marp, the pptx and the
 * `.imscc` need nothing else). Fails with the Kroki address when a diagram
 * cannot be drawn, because a silently empty slide is worse.
 */
export async function renderDiagramFences(
  markdown: string,
  diagrams: ResolvedDiagramConfig = resolveDiagramsConfig({}),
  fetcher: typeof fetch = fetch,
  svgImages?: Map<string, string>,
): Promise<string> {
  const fence = /^```(plantuml|mermaid)[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm;
  const matches = [...markdown.matchAll(fence)];
  if (!matches.length) return markdown;
  let result = "";
  let last = 0;
  for (const match of matches) {
    const index = match.index!;
    const title = markdown.slice(0, index).match(/^# (.+)$/gm)?.pop()?.slice(2)
      .trim() ?? `${match[1]} diagram`;
    const url = `${diagrams.krokiUrl.replace(/\/+$/, "")}/${match[1]}/svg`;
    let svg: string;
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: match[2],
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      svg = await response.text();
    } catch (error) {
      throw new Error(
        `Slide "${title}": could not draw the ${
          match[1]
        } diagram with Kroki at ${diagrams.krokiUrl} (${
          error instanceof Error ? error.message : String(error)
        }). Check \`diagrams.krokiUrl\` and that Kroki is running.`,
      );
    }
    const data = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
    let target = `data:image/svg+xml;base64,${data}`;
    if (svgImages) {
      // Marp rejects SVG data URLs in Markdown; the placeholder is replaced in
      // the rendered HTML (see `renderPreviewSlides`).
      const existing = [...svgImages].find(([, value]) => value === target)
        ?.[0];
      const placeholder = existing ?? `bso-embedded-svg-${svgImages.size}.svg`;
      svgImages.set(placeholder, target);
      target = placeholder;
    }
    result += markdown.slice(last, index) +
      `![${title.replace(/[\[\]]/g, "")}](${target})`;
    last = index + match[0].length;
  }
  return result + markdown.slice(last);
}

/**
 * Joins the generated slide deck and the manual slide decks into one presentation. When
 * the first chunk's front matter has `headingDivider`, Marp already starts a
 * slide at those headings, so a `---` in front of one would add an empty slide
 * : the generated slides then lose such separators, and the join takes
 * no `---` before a heading. A manual slide deck's own `---` stay as the author wrote them.
 */
function joinChunks(chunks: string[], generated: boolean): string {
  const levels = headingDividerLevels(frontmatter(chunks[0])?.header ?? "");
  if (!levels.length) return chunks.join("\n\n---\n\n");
  const parts = chunks.map((chunk, index) => {
    if (index > 0 || !generated) return chunk;
    const deck = frontmatter(chunk);
    return deck
      ? deck.header + dropEmptySlideSeparators(deck.body, levels)
      : chunk;
  });
  return parts.reduce((joined, part, index) => {
    if (index === 0) return part;
    const first = part.match(/^\s*(#{1,6})\s/);
    const splits = first !== null && levels.includes(first[1].length);
    return joined + (splits ? "\n\n" : "\n\n---\n\n") + part;
  });
}

/**
 * Rewrites the relative image paths of Markdown that is moved from the folder
 * `fromDir` into a file in the folder `toDir`, so that the images are still
 * found when they are embedded.
 */
function rewriteImagePaths(
  content: string,
  fromDir: string,
  toDir: string,
): string {
  return content.replace(
    /(!\[[^\]]*\]\()(<?)([^)>\s]+)(>?[^)]*\))/g,
    (whole, open, angle, url, close) =>
      /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)
        ? whole
        : `${open}${angle}${
          relative(toDir, resolve(fromDir, url)).replaceAll("\\", "/")
        }${close}`,
  );
}

/**
 * Marks an entry of the result as the separate presentation of a slide deck
 * that a lesson links to.
 */
export const DECK_KEY_PREFIX = "deck:";

/** Prefix of the entries that mark a lesson whose deck is generated from the lesson itself (a lesson presentation). */
export const LESSON_KEY_PREFIX = "lesson:";

/** Prefix of the entries with the first slide deck that a generated lesson links: its extra slides. */
export const EXTRA_KEY_PREFIX = "extra:";

/**
 * The slide decks that a lesson links to. The links are resolved relative to the
 * lesson file, and a target only counts when the file exists and is marked as a
 * slide deck.
 */
export function readDeckLinks(
  lessonPath: string,
  markdown: string,
): DeckLink[] {
  return findDeckLinks(
    markdown,
    (href) => resolve(dirname(lessonPath), decodeURIComponent(href)),
    (path) => {
      try {
        return Deno.readTextFileSync(path);
      } catch {
        return null;
      }
    },
    (path) => basename(path).replace(/\.md$/i, ""),
  );
}

/** The slide decks that each Markdown file under `sources` links to. */
async function scanDeckLinks(
  sources: string,
  output: string,
  tools: string,
): Promise<Map<string, DeckLink[]>> {
  const linked = new Map<string, DeckLink[]>();
  for (const file of await collect(sources, output, tools)) {
    const decks = readDeckLinks(
      file,
      (await Deno.readTextFile(file)).replace(/\r\n/g, "\n"),
    );
    if (decks.length) linked.set(file, decks);
  }
  return linked;
}

/**
 * Decides which links of a lesson are replaced by the slides of the page they
 * point to. A link is replaced when its target matches one of the glob patterns
 * of the `nest` setting (the patterns are relative to the folder of the lesson)
 * and the target is a lesson page and not a slide deck. A matching link to a
 * file that does not exist makes the build fail. The page is read again at
 * every build, so a change in the page shows up in the next build.
 */
function nestResolver(
  lesson: string,
  globs: string[] | undefined,
): ((url: string) => { id: string; source: string } | undefined) | undefined {
  if (!globs?.length) return undefined;
  const matchers = globs.map((glob) =>
    globToRegExp(glob.replaceAll("\\", "/"), { extended: true, globstar: true })
  );
  return (url) => {
    if (!/\.md(?:#|$)/i.test(url) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) {
      return undefined;
    }
    const path = resolve(
      dirname(lesson),
      decodeURIComponent(url.split(/[?#]/, 1)[0]),
    );
    const relativePath = relative(dirname(lesson), path).replaceAll("\\", "/");
    if (!matchers.some((matcher) => matcher.test(relativePath))) {
      return undefined;
    }
    let text: string;
    try {
      text = Deno.readTextFileSync(path).replace(/\r\n/g, "\n");
    } catch {
      throw new Error(
        `Slides: ${lesson} links '${url}', which matches nest, but ${path} does not exist.`,
      );
    }
    if (isSlideDeck(text)) return undefined;
    return {
      id: path,
      // Image paths and links to other pages are relative to the nested page; the deck is that of the overview page.
      source: rewriteLinkTargets(
        rewriteImagePaths(
          expandSlideIncludes(text, path),
          dirname(path),
          dirname(lesson),
        ),
        (href) => {
          const [target, fragment] = href.split("#");
          if (!target) return undefined;
          let decoded = target;
          try {
            decoded = decodeURIComponent(target);
          } catch {
            // keep the raw target
          }
          return `${
            relative(dirname(lesson), resolve(dirname(path), decoded))
              .replaceAll("\\", "/")
          }${fragment === undefined ? "" : `#${fragment}`}`;
        },
      ),
    };
  };
}

/**
 * Expands the `{@include}` lines of a lesson or slide deck for its slides, one
 * level deep. Relative image paths of the included text are rewritten
 * to be relative to the including file, because images are embedded from there.
 */
function expandSlideIncludes(markdown: string, sourcePath: string): string {
  const warnings: string[] = [];
  const expanded = expandIncludesOnce(
    markdown,
    dirname(sourcePath),
    {
      resolve: (fromDir, target) =>
        resolve(fromDir, decodeURIComponent(target.split(/[?#]/, 1)[0])),
      dirname,
      readFile: (path) => {
        try {
          return Deno.readTextFileSync(path);
        } catch {
          return null;
        }
      },
      warn: (message) => warnings.push(message),
    },
    (content, includeDir) =>
      rewriteImagePaths(content, includeDir, dirname(sourcePath)),
  );
  if (warnings.length) {
    throw new Error(`Slides: ${warnings.join("; ")} (in ${sourcePath})`);
  }
  return expanded;
}

/**
 * Build self-contained lesson presentations in lexical slide deck order, retaining notes
 * and slide separators. The first slide deck's frontmatter defines presentation-wide
 * settings (theme, size, metadata); subsequent slide deck frontmatter is not a slide.
 * Undefined configuration is a strict no-op. Only staticDir/slides is replaced.
 * The pinned CLI is cached in dirname(staticDir)/marp-tools with patched math dependencies.
 */
export async function renderPreviewSlides(
  config: SlidesConfig | undefined,
  repoRoot: string,
  sourcesDir: string,
  staticDir: string,
  runner: SlidesRunner = runNpm,
  diagrams?: ResolvedDiagramConfig,
  previewFavicon?: string,
): Promise<Record<string, string>> {
  if (!config) return {};
  const maxImageWidth = config.maxImageWidth ?? DEFAULT_MAX_IMAGE_WIDTH;
  if (
    (config.lessons !== undefined &&
      (typeof config.lessons !== "object" || config.lessons === null ||
        Array.isArray(config.lessons))) ||
    (config.lessons === undefined && config.generateForPrefix === undefined)
  ) {
    throw new Error(
      "Slides preview: configure lessons or generateForPrefix",
    );
  }
  if (
    config.generateForPrefix !== undefined &&
    (!config.generateForPrefix.trim() || /[\\/]/.test(config.generateForPrefix))
  ) {
    throw new Error(
      "Slides preview: generateForPrefix must be a filename prefix without path separators",
    );
  }
  if (
    config.disclaimer !== undefined && typeof config.disclaimer !== "string"
  ) {
    throw new Error("Slides preview: disclaimer must be a string");
  }
  const root = await Deno.realPath(resolve(repoRoot));
  const sources = resolve(root, sourcesDir);
  const output = resolve(root, staticDir);
  await confined(sources, root);
  await confined(output, root);
  const slides = join(output, "slides");
  const tools = join(dirname(output), "marp-tools");
  await confined(slides, root);
  const lessons = new Map(Object.entries(config.lessons ?? {}));
  if (config.generateForPrefix) {
    const sourceFiles = await collect(sources, output, tools);
    for (const file of sourceFiles) {
      const lessonPath = relative(sources, file).replaceAll("\\", "/");
      const filename = lessonPath.split("/").at(-1) ?? "";
      if (
        filename.startsWith(config.generateForPrefix) &&
        !lessons.has(lessonPath)
      ) {
        lessons.set(lessonPath, { generate: true });
      }
    }
  }
  const mappings = [...lessons.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const plans: {
    lesson: string;
    url: string;
    decks: string[];
    generate: boolean;
    nest?: string[];
    /** The lesson option `pptx`: undefined means the course-wide setting. */
    pptx?: boolean;
  }[] = [];
  const themePath = config.theme
    ? isAbsolute(config.theme) ? config.theme : resolve(root, config.theme)
    : undefined;
  let themeName: string | undefined;
  if (themePath) {
    await confined(themePath, root);
    const themeStat = await Deno.stat(themePath).catch(() => undefined);
    if (!themeStat?.isFile) {
      throw new Error(`Slides preview: theme is not a file: ${themePath}`);
    }
    const themeCss = await Deno.readTextFile(themePath);
    themeName = themeCss.match(/@theme[ \t]+([-\w]+)/)?.[1];
    if (!themeName) {
      throw new Error(
        `Slides preview: theme CSS must declare a name with @theme: ${themePath}`,
      );
    }
  }
  const logo = config.logo ? await dataImage(config.logo, root) : undefined;
  const files = mappings.length ? await collect(root, output, tools) : [];
  const urls = new Set<string>();
  for (const [lessonPath, selection] of mappings) {
    relativePath(lessonPath, "lesson path");
    const generate = typeof selection === "string"
      ? false
      : selection?.generate === true;
    const pattern = typeof selection === "string"
      ? selection
      : selection?.decks;
    if (
      (pattern !== undefined && typeof pattern !== "string") ||
      (typeof selection !== "string" && (
        !selection || typeof selection !== "object" ||
        Array.isArray(selection) ||
        Object.keys(selection).some((key) =>
          key !== "generate" && key !== "decks" && key !== "nest" &&
          key !== "pptx"
        ) ||
        (selection.generate !== undefined &&
          typeof selection.generate !== "boolean") ||
        (selection.decks !== undefined &&
          typeof selection.decks !== "string") ||
        (!generate && pattern === undefined &&
          !(config.generateForPrefix && selection.generate === false))
      ))
    ) {
      throw new Error(
        `Slides preview: invalid slide selection for ${lessonPath}`,
      );
    }
    if (pattern !== undefined) relativePath(pattern, "slide glob");
    const lesson = resolve(sources, lessonPath);
    within(lesson, sources);
    await confined(lesson, root);
    const stat = await Deno.stat(lesson).catch(() => undefined);
    if (!stat?.isFile) {
      throw new Error(`Slides preview: lesson file does not exist: ${lesson}`);
    }
    const decks: string[] = [];
    if (pattern !== undefined) {
      const matcher = globToRegExp(pattern.replaceAll("\\", "/"), {
        extended: true,
        globstar: true,
      });
      for (const file of files) {
        if (matcher.test(relative(root, file).replaceAll("\\", "/"))) {
          const text = (await Deno.readTextFile(file)).replace(/\r\n/g, "\n");
          if (deckMarkerConflict(text)) {
            throw new Error(
              `Slides preview: ${
                relative(root, file)
              } matches "decks" of ${lessonPath} (${pattern}) but its front matter has both 'slides' and 'marp'; use only 'slides: true'.`,
            );
          }
          if (!frontmatter(text)) continue;
          decks.push(file);
        }
      }
      if (!decks.length) {
        console.warn(
          `  ⚠ slides: the "decks" pattern ${pattern} of ${lessonPath} matches no file.`,
        );
      }
    }
    if (!decks.length && !generate) continue;
    const slug = relative(sources, lesson).replaceAll("\\", "/").replace(
      /\.md$/i,
      "",
    ).split(
      "/",
    ).map(encodeURIComponent).join("/");
    const url = `slides/${slug}/index.html`;
    if (urls.has(url)) {
      throw new Error(`Slides preview: duplicate lesson output: ${url}`);
    }
    urls.add(url);
    const nest = typeof selection === "object" && selection?.nest !== undefined
      ? [selection.nest].flat()
      : undefined;
    const pptx = typeof selection === "object" && selection?.pptx !== undefined
      ? selection.pptx === true
      : undefined;
    plans.push({ lesson, url, decks, generate, nest, pptx });
  }
  // Slide decks that lessons link to: each gets a standalone presentation.
  const linkedByLesson = await scanDeckLinks(sources, output, tools);
  const standalone = new Set<string>();
  for (const decks of linkedByLesson.values()) {
    for (const deck of decks) standalone.add(deck.path);
  }
  for (const deckPath of [...standalone].sort()) {
    const slug = relative(root, deckPath).replaceAll("\\", "/").replace(
      /\.md$/i,
      "",
    ).split("/").map(encodeURIComponent).join("/");
    const url = `slides/decks/${slug}/index.html`;
    if (urls.has(url)) {
      throw new Error(`Slides preview: duplicate slide deck output: ${url}`);
    }
    urls.add(url);
    plans.push({
      lesson: DECK_KEY_PREFIX + deckPath,
      url,
      decks: [deckPath],
      generate: false,
    });
  }
  try {
    const stat = await Deno.lstat(slides);
    if (stat.isSymlink) {
      throw new Error(
        `Slides preview: output directory cannot be a symlink: ${slides}`,
      );
    }
    await Deno.remove(slides, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const result: Record<string, string> = {};
  // The start of the titles that the course leaves out (`slides.titlePrefix`), in the HTML and the pptx.
  const titled = (markdown: string) =>
    config.titlePrefix
      ? stripTitlePrefix(markdown, config.titlePrefix)
      : markdown;
  let toolsPrepared = false;
  for (const plan of plans) {
    const chunks: string[] = [];
    const svgImages = new Map<string, string>();
    const lessonDecks = linkedByLesson.get(plan.lesson) ?? [];
    // The generated deck as a self-contained Markdown text, for its pptx.
    let generatedForPptx: string | undefined;
    // A slide deck that is linked and configured is inserted at the link only (L9).
    const configured = plan.generate
      ? plan.decks.filter((deck) =>
        !lessonDecks.some((linked) => linked.path === deck)
      )
      : plan.decks;
    if (plan.generate) {
      const generated = await renderDiagramFences(
        await embedImages(
          generateLessonSlides(
            expandSlideIncludes(
              (await Deno.readTextFile(plan.lesson)).replace(/\r\n/g, "\n"),
              plan.lesson,
            ),
            {
              locale: (diagrams ?? resolveDiagramsConfig({})).locale === "en"
                ? "en"
                : "nl",
              contentsTitle:
                (diagrams ?? resolveDiagramsConfig({})).locale === "en"
                  ? "Contents"
                  : "Inhoudsopgave",
              linkedDeck: (url) => {
                const path = resolve(
                  dirname(plan.lesson),
                  decodeURIComponent(url.split(/[?#]/, 1)[0]),
                );
                const deck = lessonDecks.find((each) => each.path === path);
                if (!deck) return undefined;
                return {
                  id: path,
                  title: deck.title,
                  markdown: rewriteImagePaths(
                    expandSlideIncludes(deck.body, deck.path),
                    dirname(deck.path),
                    dirname(plan.lesson),
                  ),
                };
              },
              nestedPage: nestResolver(plan.lesson, plan.nest),
            },
          ),
          plan.lesson,
          root,
          svgImages,
          maxImageWidth,
        ),
        diagrams,
        undefined,
        svgImages,
      );
      generatedForPptx = generated;
      const generatedDeck = frontmatter(generated)!;
      chunks.push(
        themeName
          ? setTheme(generatedDeck.header, themeName) + generatedDeck.body
          : generated,
      );
    }
    for (const [index, source] of configured.entries()) {
      await confined(source, root);
      const embedded = await embedImages(
        expandSlideIncludes(
          (await Deno.readTextFile(source)).replace(/\r\n/g, "\n"),
          source,
        ),
        source,
        root,
        svgImages,
        maxImageWidth,
      );
      const deck = frontmatter(embedded)!;
      if (plan.generate && index === 0) {
        const generated = frontmatter(chunks[0])!;
        chunks[0] =
          (themeName ? setTheme(deck.header, themeName) : deck.header) +
          generated.body;
        chunks.push(deck.body);
      } else {
        chunks.push(
          chunks.length
            ? deck.body
            : (themeName ? setTheme(deck.header, themeName) : deck.header) +
              deck.body,
        );
      }
    }
    // A manual deck with `nest`: the pages that the lesson links to follow it as appendix slides (N13).
    let appendixForPptx: string | undefined;
    if (!plan.generate && plan.nest?.length && configured.length) {
      const lessonText = expandSlideIncludes(
        (await Deno.readTextFile(plan.lesson)).replace(/\r\n/g, "\n"),
        plan.lesson,
      );
      const appendix = generateNestedAppendix(lessonText, {
        locale: (diagrams ?? resolveDiagramsConfig({})).locale === "en"
          ? "en"
          : "nl",
        nestedPage: nestResolver(plan.lesson, plan.nest),
      });
      if (appendix) {
        const processed = await renderDiagramFences(
          await embedImages(
            appendix,
            plan.lesson,
            root,
            svgImages,
            maxImageWidth,
          ),
          diagrams,
          undefined,
          svgImages,
        );
        // A `---` before a heading that the `headingDivider` of the deck splits at
        // would give an empty slide: leave it out, the heading starts the slide.
        const levels = headingDividerLevels(
          frontmatter(chunks[0])?.header ?? "",
        );
        chunks.push(
          levels.length
            ? dropEmptySlideSeparators(processed, levels)
            : processed,
        );
        appendixForPptx = processed;
      }
    }
    const destination = join(
      output,
      ...plan.url.split("/").map(decodeURIComponent),
    );
    await Deno.mkdir(dirname(destination), { recursive: true });
    const input = join(dirname(destination), ".bso-slides-input.md");
    try {
      await Deno.writeTextFile(
        input,
        titled(joinChunks(chunks, plan.generate)),
      );
      if (!toolsPrepared) {
        const rel = relative(output, tools);
        if (
          rel === "" ||
          (!isAbsolute(rel) && rel !== ".." && !rel.startsWith("../") &&
            !rel.startsWith("..\\"))
        ) {
          throw new Error(
            `Slides preview: static directory must not contain the tool cache: ${tools}`,
          );
        }
        await prepareTools(tools, root, runner);
        toolsPrepared = true;
      }
      const marpArgs = [
        "exec",
        "--prefix",
        tools,
        "--offline",
        "--",
        "marp",
        input,
        "--output",
        destination,
        "--no-config",
        "--no-html",
        "--allow-local-files",
      ];
      if (themePath) marpArgs.push("--theme-set", themePath);
      await runner(marpArgs, root);
      let html = await Deno.readTextFile(destination);
      for (const [placeholder, url] of svgImages) {
        html = html.replaceAll(placeholder, url);
      }
      let slideLogo = logo;
      if (!config.theme) slideLogo = logo ?? await defaultSlideLogo();
      if (slideLogo) html = addLogo(html, slideLogo);
      if (!config.theme) html = withSlideLayout(html, slideLogo!);
      const disclaimer = config.disclaimer ?? DEFAULT_DISCLAIMER;
      const pptxNames: string[] = [];
      {
        const used = new Set<string>();
        // The generated deck of a lesson, nested pages included, only when the lesson
        // says `pptx: true`: the dedicated slides are the ones to download (rule X1).
        if (
          generatedForPptx !== undefined && plan.pptx === true
        ) {
          let markdown = generatedForPptx;
          // Diagrams and some images carry a placeholder name for Marp; the pptx takes the data URL itself.
          for (const [placeholder, url] of svgImages) {
            markdown = markdown.replaceAll(placeholder, url);
          }
          const bytes = await convertDeckToPptx(titled(markdown), {
            baseDir: dirname(plan.lesson),
            notes: config.notes === true,
            logo: config.logo
              ? (isAbsolute(config.logo)
                ? config.logo
                : resolve(root, config.logo))
              : undefined,
            disclaimer,
          });
          // Named after the lesson file, so a download says what it is from.
          const lessonPptx = `${
            basename(plan.lesson).replace(/\.md$/i, "")
          }.pptx`;
          await Deno.writeFile(join(dirname(destination), lessonPptx), bytes);
          pptxNames.push(lessonPptx);
          used.add(lessonPptx);
        }
        for (const source of configured) {
          const markdown = expandSlideIncludes(
            (await Deno.readTextFile(source)).replace(/\r\n/g, "\n"),
            source,
          );
          if (!deckWantsPptx(markdown, config.pptx === true)) continue;
          // The appendix slides of the lesson follow the last manual deck.
          let deckMarkdown = markdown;
          if (appendixForPptx && source === configured[configured.length - 1]) {
            let appendix = appendixForPptx;
            for (const [placeholder, url] of svgImages) {
              appendix = appendix.replaceAll(placeholder, url);
            }
            deckMarkdown = `${markdown.trimEnd()}\n\n---\n\n${appendix}\n`;
          }
          let name = `${basename(source).replace(/\.md$/i, "")}.pptx`;
          for (let n = 2; used.has(name); n++) {
            name = `${basename(source).replace(/\.md$/i, "")}-${n}.pptx`;
          }
          used.add(name);
          const bytes = await convertDeckToPptx(titled(deckMarkdown), {
            maxImageWidth,
            baseDir: dirname(source),
            notes: config.notes === true,
            logo: config.logo
              ? (isAbsolute(config.logo)
                ? config.logo
                : resolve(root, config.logo))
              : undefined,
            disclaimer,
          });
          await Deno.writeFile(join(dirname(destination), name), bytes);
          pptxNames.push(name);
        }
      }
      html = withBackControls(
        html,
        (diagrams ?? resolveDiagramsConfig({})).locale === "en"
          ? "back to the lesson"
          : "terug naar de les",
      );
      if (previewFavicon) {
        html = withFavicon(
          html,
          await Deno.readFile(previewFavicon),
          previewFavicon,
        );
      }
      await Deno.writeTextFile(
        destination,
        withPptxLinks(
          disclaimer
            ? html.replace(/<\/head>/i, `${banner(disclaimer)}</head>`)
            : html,
          pptxNames,
        ),
      );
      result[plan.lesson] = plan.url;
      if (plan.generate) result[LESSON_KEY_PREFIX + plan.lesson] = plan.url;
    } catch (error) {
      throw new Error(
        `Slides preview: rendering lesson ${plan.lesson} (${
          plan.decks.join(", ")
        }) failed: ${error}`,
      );
    } finally {
      await Deno.remove(input).catch((error) => {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      });
    }
  }
  // The extra slides of a lesson presentation: the first slide deck that the lesson links.
  for (const [lesson, decks] of linkedByLesson) {
    if (result[LESSON_KEY_PREFIX + lesson] === undefined) continue;
    const first = decks.map((deck) => result[DECK_KEY_PREFIX + deck.path]).find(
      (url) => url !== undefined,
    );
    if (first) result[EXTRA_KEY_PREFIX + lesson] = first;
  }
  return result;
}

/**

/**
 * Removes the presenter notes Marp writes as `<div class="bespoke-marp-note">`
 * elements, balancing nested divs. The rest of the slide deck stays byte for byte.
 */
export function stripPresenterNotes(html: string): string {
  const open = /<div class="bespoke-marp-note"[^>]*>/g;
  const tag = /<(\/?)div\b[^>]*>/g;
  let result = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html)) !== null) {
    if (match.index < last) continue;
    tag.lastIndex = match.index + match[0].length;
    let depth = 1;
    let end = html.length;
    let next: RegExpExecArray | null;
    while ((next = tag.exec(html)) !== null) {
      depth += next[1] ? -1 : 1;
      if (depth === 0) {
        end = next.index + next[0].length;
        break;
      }
    }
    result += html.slice(last, match.index);
    last = end;
    open.lastIndex = end;
  }
  return result + html.slice(last);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(
    /</g,
    "&lt;",
  ).replace(/>/g, "&gt;");
}

/**
 * Renders the lesson presentations like the preview and copies each one into
 * the build's content folder as `<lesson>-slides.html`, so `pack` lists it
 * as a topic right after its lesson. The title (`Slides: <lesson title>`) is
 * written as `bso-title`, because a slide deck's first `<h1>` is a slide title.
 *
 * Presenter notes are removed unless `slides.notes` is true.
 *
 * Returns the paths relative to `contentDir`, for example `week-1/lesson-slides.html`.
 */
export async function exportSlidesToContent(
  config: SlidesConfig | undefined,
  repoRoot: string,
  sourcesDir: string,
  staticDir: string,
  contentDir: string,
  runner: SlidesRunner = runNpm,
  diagrams?: ResolvedDiagramConfig,
): Promise<string[]> {
  if (!config) return [];
  const rendered = await renderPreviewSlides(
    config,
    repoRoot,
    sourcesDir,
    staticDir,
    runner,
    diagrams,
  );
  const root = await Deno.realPath(resolve(repoRoot));
  const sources = resolve(root, sourcesDir);
  const staticRoot = resolve(root, staticDir);
  const exported: string[] = [];
  const exportTopic = async (
    url: string,
    topic: string,
    title: string,
    copyName: (name: string) => string,
  ): Promise<void> => {
    const rendered = await Deno.readTextFile(
      join(staticRoot, ...url.split("/").map(decodeURIComponent)),
    );
    // The notes are for the teacher; the topic is open to every student.
    const html = stripBackControls(
      config.notes === true ? rendered : stripPresenterNotes(rendered),
    );
    // The slides are files that the lesson page opens, not items of the menu (rule S1).
    const meta = `<meta name="bso-title" content="${
      escapeAttribute(title)
    }"><meta name="bso-hidden" content="slides">`;
    // Each linked .pptx goes along, named after the lesson, so slide decks never clash.
    let linked = html;
    for (const name of pptxLinkNames(html)) {
      const copy = copyName(name);
      const from = join(
        staticRoot,
        ...url.split("/").slice(0, -1).map(decodeURIComponent),
        name,
      );
      const target = join(contentDir, dirname(topic), copy);
      await Deno.mkdir(dirname(target), { recursive: true });
      await Deno.copyFile(from, target);
      linked = linked.replaceAll(
        `"${escapeAttribute(name)}"`,
        `"${escapeAttribute(copy)}"`,
      );
    }
    const withTitle = /<head[^>]*>/i.test(linked)
      ? linked.replace(/<head[^>]*>/i, (tag) => `${tag}${meta}`)
      : `${meta}${linked}`;
    const destination = join(contentDir, `${topic}.html`);
    await Deno.mkdir(dirname(destination), { recursive: true });
    await Deno.writeTextFile(destination, withTitle);
    exported.push(`${topic}.html`);
  };
  const lessonTitle = async (stem: string): Promise<string> => {
    const lessonHtml = await Deno.readTextFile(join(contentDir, `${stem}.html`))
      .catch(() => "");
    const h1 = lessonHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1].trim();
    return h1 ?? stem.split("/").pop()!;
  };
  const stemOf = (lesson: string) =>
    relative(sources, lesson).replaceAll("\\", "/").replace(/\.md$/i, "");
  // Per lesson: the file of the lesson presentation (Alt+T) and of the first extra deck (Alt+P and the button).
  const markers = new Map<string, { lesson?: string; extra?: string }>();
  const mark = (stem: string, kind: "lesson" | "extra", file: string) => {
    const known = markers.get(stem) ?? {};
    if (known[kind] === undefined) known[kind] = file;
    markers.set(stem, known);
  };
  for (const [lesson, url] of Object.entries(rendered)) {
    if (
      lesson.startsWith(DECK_KEY_PREFIX) ||
      lesson.startsWith(LESSON_KEY_PREFIX) ||
      lesson.startsWith(EXTRA_KEY_PREFIX)
    ) continue;
    const stem = stemOf(lesson);
    mark(
      stem,
      rendered[LESSON_KEY_PREFIX + lesson] === undefined ? "extra" : "lesson",
      `${basename(stem)}-slides.html`,
    );
    await exportTopic(
      url,
      `${stem}-slides`,
      `Slides: ${await lessonTitle(stem)}`,
      // The pptx of the lesson itself is already named after it.
      (name) =>
        name.startsWith(`${basename(stem)}.`)
          ? name
          : `${basename(stem)}-${name}`,
    );
  }
  // The standalone presentation of each slide deck a lesson links to, as a topic
  // after the lesson's own slides topic.
  const tools = join(dirname(staticRoot), "marp-tools");
  const linkedDecks = await scanDeckLinks(sources, staticRoot, tools);
  for (
    const [lesson, decks] of [...linkedDecks].sort(([a], [b]) => a < b ? -1 : 1)
  ) {
    const stem = stemOf(lesson);
    const seen = new Set<string>();
    for (const deck of decks) {
      const url = rendered[DECK_KEY_PREFIX + deck.path];
      if (!url || seen.has(deck.path)) continue;
      seen.add(deck.path);
      mark(
        stem,
        "extra",
        `${
          deckTopicName(
            basename(stem),
            basename(deck.path).replace(/\.md$/i, ""),
          )
        }.html`,
      );
      await exportTopic(
        url,
        join(
          dirname(stem),
          deckTopicName(
            basename(stem),
            basename(deck.path).replace(/\.md$/i, ""),
          ),
        ).replaceAll("\\", "/"),
        `Slides: ${await lessonTitle(stem)} — ${deck.title}`,
        () =>
          `${
            deckTopicName(
              basename(stem),
              basename(deck.path).replace(/\.md$/i, ""),
            )
          }.pptx`,
      );
    }
  }
  // The lesson page opens its slides with the button and the keys of the preview (rule S2).
  const script = await loadAssetText("brightspacosaurus-slides.js");
  for (const [stem, found] of markers) {
    const path = join(contentDir, `${stem}.html`);
    const page = await Deno.readTextFile(path).catch(() => undefined);
    if (page === undefined || page.includes("data-bso-slides-client")) continue;
    const attributes = [
      found.extra ? ` data-bso-slides="${escapeAttribute(found.extra)}"` : "",
      found.lesson
        ? ` data-bso-slides-lesson="${escapeAttribute(found.lesson)}"`
        : "",
    ].join("");
    const injected =
      `<span hidden${attributes}></span><script data-bso-slides-client>${script}</script>`;
    await Deno.writeTextFile(
      path,
      /<\/body>/i.test(page)
        ? page.replace(/<\/body>/i, () => `${injected}</body>`)
        : page + injected,
    );
  }
  return exported;
}
