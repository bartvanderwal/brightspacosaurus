import {
  basename,
  dirname,
  globToRegExp,
  isAbsolute,
  join,
  relative,
  resolve,
} from "@std/path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import type { SlidesConfig } from "./types.ts";
import { generateLessonSlides } from "./lesson-slides.ts";
import { convertDeckToPptx } from "./pptx/mod.ts";

export type { SlidesConfig } from "./types.ts";

/** Injectable command boundary, so selection and rewriting can be tested offline. */
export type SlidesRunner = (args: string[], cwd: string) => Promise<void>;

/** Neutral on purpose: no school year or period; a course sets its own text (#113). */
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
 * remains supported for existing decks and is normalized for the Marp CLI.
 * Nested keys, block scalars, quoted "true", and ordinary Markdown do not.
 */
function frontmatter(
  text: string,
): { header: string; body: string } | undefined {
  const match = text.match(
    /^(?:\uFEFF)?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/,
  );
  if (!match) return undefined;
  const lines = match[1].split("\n");
  const markers = lines.filter((line) => /^(?:marp|slides)[ \t]*:/.test(line));
  if (
    markers.length !== 1 ||
    !/^(?:marp|slides)[ \t]*:[ \t]+true[ \t]*(?:#.*)?$/.test(markers[0])
  ) return undefined;
  // Reject prose or malformed top-level YAML rather than interpreting it as a deck.
  if (
    lines.some((line) =>
      line.trim() && !/^(?:[ \t]+|#|[A-Za-z_][\w-]*[ \t]*:)/.test(line)
    )
  ) return undefined;
  return {
    header: match[0].replace(/^slides[ \t]*:.*$/m, "marp: true"),
    body: text.slice(match[0].length),
  };
}

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
    const bytes = await Deno.readFile(path);
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
    if (!imageCache.has(url)) imageCache.set(url, imageUrl(url, source, root));
    return imageCache.get(url)!;
  }
  function markdownImageUrl(url: string, alt?: string | null): string {
    // Marp rejects ordinary SVG data images, but supports SVG backgrounds.
    // Ordinary SVGs are embedded in the rendered image attributes instead.
    if (
      !url.startsWith("data:image/svg+xml;base64,") ||
      /(?:^|\s)bg(?:\s|$)/.test(alt ?? "")
    ) return url;
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
      const url = markdownImageUrl(await embeddedUrl(node.url), node.alt);
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
        ? markdownImageUrl(await embeddedUrl(definition.url), node.alt)
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

const EXIT_CONTROLS_ID = "bso-slides-exit";

/**
 * Lets the presenter leave a preview deck with Esc or the Alt/Option+P that
 * opened it: the deck lives in a tab the shortcut opened, so the tab closes.
 * In full screen the browser takes the first Esc itself. Preview only; the
 * export removes it again (`stripExitControls`).
 */
export function withExitControls(html: string): string {
  const script =
    `<script id="${EXIT_CONTROLS_ID}">document.addEventListener("keydown",function(e){var alt=e.altKey&&e.code==="KeyP"&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey;var esc=e.key==="Escape"&&!document.fullscreenElement;if(!alt&&!esc)return;e.preventDefault();window.close()})</script>`;
  return /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${script}</head>`)
    : html + script;
}

/** Removes the preview-only exit script, so it never reaches the `.imscc`. */
export function stripExitControls(html: string): string {
  return html.replace(
    new RegExp(`<script id="${EXIT_CONTROLS_ID}">[\\s\\S]*?</script>`),
    "",
  );
}

const PPTX_STYLE_ID = "bso-pptx-style";

/**
 * Whether a deck gets a `.pptx`. The deck's own `pptx: true | false | auto`
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
      `<a href="${escapeAttribute(name)}" download>Download ${
        escapeAttribute(name)
      }</a>`
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
    return `${opening}<img class="bso-slide-logo" src="${logo}" alt="" style="position:absolute;top:1rem;right:1rem;max-width:20%;max-height:15%;object-fit:contain">`;
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
 * Build self-contained lesson presentations in lexical deck order, retaining notes
 * and slide separators. The first deck's frontmatter defines presentation-wide
 * settings (theme, size, metadata); subsequent deck frontmatter is not a slide.
 * Undefined configuration is a strict no-op. Only staticDir/slides is replaced.
 * The pinned CLI is cached in dirname(staticDir)/marp-tools with patched math dependencies.
 */
export async function renderPreviewSlides(
  config: SlidesConfig | undefined,
  repoRoot: string,
  sourcesDir: string,
  staticDir: string,
  runner: SlidesRunner = runNpm,
): Promise<Record<string, string>> {
  if (!config) return {};
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
          key !== "generate" && key !== "decks"
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
          if (
            frontmatter((await Deno.readTextFile(file)).replace(/\r\n/g, "\n"))
          ) decks.push(file);
        }
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
    plans.push({ lesson, url, decks, generate });
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
  let toolsPrepared = false;
  for (const plan of plans) {
    const chunks: string[] = [];
    const svgImages = new Map<string, string>();
    if (plan.generate) {
      const generated = await embedImages(
        generateLessonSlides(
          (await Deno.readTextFile(plan.lesson)).replace(/\r\n/g, "\n"),
        ),
        plan.lesson,
        root,
        svgImages,
      );
      const generatedDeck = frontmatter(generated)!;
      chunks.push(
        themeName
          ? setTheme(generatedDeck.header, themeName) + generatedDeck.body
          : generated,
      );
    }
    for (const [index, source] of plan.decks.entries()) {
      await confined(source, root);
      const embedded = await embedImages(
        (await Deno.readTextFile(source)).replace(/\r\n/g, "\n"),
        source,
        root,
        svgImages,
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
    const destination = join(
      output,
      ...plan.url.split("/").map(decodeURIComponent),
    );
    await Deno.mkdir(dirname(destination), { recursive: true });
    const input = join(dirname(destination), ".bso-slides-input.md");
    try {
      await Deno.writeTextFile(input, chunks.join("\n\n---\n\n"));
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
      let html = (await Deno.readTextFile(destination)).replace(
        /<img\b[^>]*>/gi,
        (tag) =>
          tag.replace(
            /\bsrc=(["'])(.*?)\1/g,
            (attribute, quote, url) =>
              svgImages.has(url)
                ? `src=${quote}${svgImages.get(url)}${quote}`
                : attribute,
          ),
      );
      if (logo) html = addLogo(html, logo);
      const disclaimer = config.disclaimer ?? DEFAULT_DISCLAIMER;
      const pptxNames: string[] = [];
      {
        const used = new Set<string>();
        for (const source of plan.decks) {
          const markdown = (await Deno.readTextFile(source)).replace(
            /\r\n/g,
            "\n",
          );
          if (!deckWantsPptx(markdown, config.pptx === true)) continue;
          let name = `${basename(source).replace(/\.md$/i, "")}.pptx`;
          for (let n = 2; used.has(name); n++) {
            name = `${basename(source).replace(/\.md$/i, "")}-${n}.pptx`;
          }
          used.add(name);
          const bytes = await convertDeckToPptx(markdown, {
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
      await Deno.writeTextFile(
        destination,
        withPptxLinks(
          withExitControls(
            disclaimer
              ? html.replace(/<\/head>/i, `${banner(disclaimer)}</head>`)
              : html,
          ),
          pptxNames,
        ),
      );
      result[plan.lesson] = plan.url;
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
  return result;
}

/**
 * Removes the presenter notes Marp writes as `<div class="bespoke-marp-note">`
 * elements, balancing nested divs. The rest of the deck stays byte for byte.
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
 * the build's content folder as `<lesson>-slides.html` (#112), so `pack` lists it
 * as a topic right after its lesson. The title (`Slides: <lesson title>`) is
 * written as `bso-title`, because a deck's first `<h1>` is a slide title.
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
): Promise<string[]> {
  if (!config) return [];
  const rendered = await renderPreviewSlides(
    config,
    repoRoot,
    sourcesDir,
    staticDir,
    runner,
  );
  const root = await Deno.realPath(resolve(repoRoot));
  const sources = resolve(root, sourcesDir);
  const staticRoot = resolve(root, staticDir);
  const exported: string[] = [];
  for (const [lesson, url] of Object.entries(rendered)) {
    const stem = relative(sources, lesson).replaceAll("\\", "/").replace(
      /\.md$/i,
      "",
    );
    const lessonHtml = await Deno.readTextFile(join(contentDir, `${stem}.html`))
      .catch(() => "");
    const h1 = lessonHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1].trim();
    const title = `Slides: ${h1 ?? stem.split("/").pop()}`;
    const rendered = await Deno.readTextFile(
      join(staticRoot, ...url.split("/").map(decodeURIComponent)),
    );
    // The notes are for the teacher; the topic is open to every student (#117).
    const html = stripExitControls(
      config.notes === true ? rendered : stripPresenterNotes(rendered),
    );
    const meta = `<meta name="bso-title" content="${escapeAttribute(title)}">`;
    // Each linked .pptx goes along, named after the lesson, so decks never clash.
    let linked = html;
    for (const name of pptxLinkNames(html)) {
      const copy = `${basename(stem)}-${name}`;
      const from = join(
        staticRoot,
        ...url.split("/").slice(0, -1).map(decodeURIComponent),
        name,
      );
      const target = join(contentDir, dirname(stem), copy);
      await Deno.mkdir(dirname(target), { recursive: true });
      await Deno.copyFile(from, target);
      linked = linked.replaceAll(
        `"${escapeAttribute(name)}"`,
        `"${escapeAttribute(copy)}"`,
      )
        .replaceAll(
          `Download ${escapeAttribute(name)}`,
          `Download ${escapeAttribute(copy)}`,
        );
    }
    const withTitle = /<head[^>]*>/i.test(linked)
      ? linked.replace(/<head[^>]*>/i, (tag) => `${tag}${meta}`)
      : `${meta}${linked}`;
    const relativeHref = `${stem}-slides.html`;
    const destination = join(contentDir, relativeHref);
    await Deno.mkdir(dirname(destination), { recursive: true });
    await Deno.writeTextFile(destination, withTitle);
    exported.push(relativeHref);
  }
  return exported;
}
