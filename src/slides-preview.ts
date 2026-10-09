import {
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

export type { SlidesConfig } from "./types.ts";

/** Injectable command boundary, so selection and rewriting can be tested offline. */
export type SlidesRunner = (args: string[], cwd: string) => Promise<void>;

const DEFAULT_DISCLAIMER = "In ontwikkeling voor 2026/2027, periode 3";

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
 * Deliberately conservative: only an unquoted top-level YAML boolean enables Marp.
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
  const marp = lines.filter((line) => /^marp[ \t]*:/.test(line));
  if (
    marp.length !== 1 || !/^marp[ \t]*:[ \t]+true[ \t]*(?:#.*)?$/.test(marp[0])
  ) return undefined;
  // Reject prose or malformed top-level YAML rather than interpreting it as a deck.
  if (
    lines.some((line) =>
      line.trim() && !/^(?:[ \t]+|#|[A-Za-z_][\w-]*[ \t]*:)/.test(line)
    )
  ) return undefined;
  return { header: match[0], body: text.slice(match[0].length) };
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
): Promise<string> {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"])
    .parse(text) as ImageNode;
  const edits: { start: number; end: number; value: string }[] = [];
  const references = new Set<string>();
  function referencesIn(node: ImageNode): void {
    if (node.type === "imageReference" && node.identifier) {
      references.add(node.identifier);
    }
    node.children?.forEach(referencesIn);
  }
  referencesIn(tree);
  async function cssUrls(fragment: string, start: number): Promise<void> {
    for (
      const match of fragment.matchAll(
        /url\(\s*(?:(["'])(.*?)\1|([^)\s]+))\s*\)/gi,
      )
    ) {
      const url = await imageUrl(match[2] ?? match[3], source, root);
      edits.push({
        start: start + match.index!,
        end: start + match.index! + match[0].length,
        value: `url("${url}")`,
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
              );
            }
          }
        }
      }
    }
    if (
      (node.type === "image" ||
        (node.type === "definition" && references.has(node.identifier!))) &&
      node.url
    ) {
      const url = await imageUrl(node.url, source, root);
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (url !== node.url && start !== undefined && end !== undefined) {
        const title = node.title ? ` ${JSON.stringify(node.title)}` : "";
        const value = node.type === "image"
          ? `![${
            (node.alt ?? "").replace(/[[\]\\]/g, "\\$&")
          }](<${url}>${title})`
          : `[${node.identifier}]: <${url}>${title}`;
        edits.push({ start, end, value });
      }
    }
    for (const child of node.children ?? []) await visit(child);
  }
  await visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
  }
  return text;
}

function banner(value: string): string {
  const escaped = value.replace(
    /[\\'"\n\r\f<>\u2028\u2029]/g,
    (char) => `\\${char.codePointAt(0)!.toString(16)} `,
  );
  return `<style id="bso-slide-disclaimer">section::before{content:"${escaped}";position:absolute;top:8px;left:12px;right:12px;font:12px sans-serif;z-index:10;pointer-events:none;opacity:.75}</style>`;
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
    !config.lessons || typeof config.lessons !== "object" ||
    Array.isArray(config.lessons)
  ) {
    throw new Error(
      "Slides preview: lessons must be a mapping of lesson paths to slide globs",
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
  const mappings = Object.entries(config.lessons).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const plans: { lesson: string; url: string; decks: string[] }[] = [];
  const files = mappings.length ? await collect(root, output, tools) : [];
  const urls = new Set<string>();
  for (const [lessonPath, pattern] of mappings) {
    relativePath(lessonPath, "lesson path");
    if (typeof pattern !== "string") {
      throw new Error(
        `Slides preview: slide glob for ${lessonPath} must be a string`,
      );
    }
    relativePath(pattern, "slide glob");
    const lesson = resolve(sources, lessonPath);
    within(lesson, sources);
    await confined(lesson, root);
    const stat = await Deno.stat(lesson).catch(() => undefined);
    if (!stat?.isFile) {
      throw new Error(`Slides preview: lesson file does not exist: ${lesson}`);
    }
    const matcher = globToRegExp(pattern.replaceAll("\\", "/"), {
      extended: true,
      globstar: true,
    });
    const decks: string[] = [];
    for (const file of files) {
      if (matcher.test(relative(root, file).replaceAll("\\", "/"))) {
        if (
          frontmatter((await Deno.readTextFile(file)).replace(/\r\n/g, "\n"))
        ) decks.push(file);
      }
    }
    if (!decks.length) continue;
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
    plans.push({ lesson, url, decks });
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
    for (const source of plan.decks) {
      await confined(source, root);
      const embedded = await embedImages(
        (await Deno.readTextFile(source)).replace(/\r\n/g, "\n"),
        source,
        root,
      );
      const deck = frontmatter(embedded)!;
      chunks.push(chunks.length ? deck.body : deck.header + deck.body);
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
      await runner([
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
      ], root);
      const html = await Deno.readTextFile(destination);
      const disclaimer = config.disclaimer ?? DEFAULT_DISCLAIMER;
      await Deno.writeTextFile(
        destination,
        disclaimer
          ? html.replace(/<\/head>/i, `${banner(disclaimer)}</head>`)
          : html,
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
