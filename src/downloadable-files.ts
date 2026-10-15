import { dirname, isAbsolute, join, relative, resolve } from "@std/path";
import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";

export const MAX_DOWNLOADABLE_FILE_SIZE = 50 * 1024 * 1024;

export interface DownloadableLink {
  url: string;
  line: number;
  column: number;
}

interface MarkdownNode {
  type: string;
  url?: string;
  children?: MarkdownNode[];
  position?: { start: { line: number; column: number } };
}

export function findDownloadableLinks(markdown: string): DownloadableLink[] {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm).parse(markdown) as MarkdownNode;
  const links: DownloadableLink[] = [];

  function visit(node: MarkdownNode): void {
    if (node.type === "link" && node.url) {
      const url = node.url;
      const path = url.split(/[?#]/, 1)[0];
      const filename = path.split("/").pop() ?? "";
      if (
        path && !path.startsWith("/") &&
        !/^[a-z][a-z\d+.-]*:/i.test(path) &&
        !/\.md$/i.test(path) &&
        /\.[^./]+$/.test(filename)
      ) {
        links.push({
          url,
          line: node.position?.start.line ?? 1,
          column: node.position?.start.column ?? 1,
        });
      }
    }
    for (const child of node.children ?? []) visit(child);
  }

  visit(tree);
  return links;
}

export type DownloadableFileResult =
  | { path: string; relativePath: string; size: number }
  | { error: "invalid-path" | "outside-sources" | "missing" | "too-large" };

export async function resolveDownloadableFile(
  linkUrl: string,
  sourceFile: string,
  sourcesDir: string,
): Promise<DownloadableFileResult> {
  const path = linkUrl.split(/[?#]/, 1)[0];
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return { error: "invalid-path" };
  }

  const root = resolve(sourcesDir);
  const target = resolve(dirname(sourceFile), decodedPath);
  const targetRelative = relative(root, target);
  if (
    !targetRelative || targetRelative === ".." ||
    targetRelative.startsWith(`..${"/"}`) ||
    targetRelative.startsWith(`..\\`) || isAbsolute(targetRelative)
  ) {
    return { error: "outside-sources" };
  }

  let info: Deno.FileInfo;
  try {
    info = await Deno.stat(target);
  } catch {
    return { error: "missing" };
  }
  if (!info.isFile) return { error: "missing" };

  let realTarget: string;
  try {
    const [realRoot, resolvedTarget] = await Promise.all([
      Deno.realPath(root),
      Deno.realPath(target),
    ]);
    realTarget = resolvedTarget;
    const realRelative = relative(realRoot, resolvedTarget);
    if (
      !realRelative || realRelative === ".." ||
      realRelative.startsWith(`..${"/"}`) ||
      realRelative.startsWith(`..\\`) || isAbsolute(realRelative)
    ) {
      return { error: "outside-sources" };
    }
  } catch {
    return { error: "missing" };
  }

  if (info.size > MAX_DOWNLOADABLE_FILE_SIZE) return { error: "too-large" };
  return {
    path: realTarget,
    relativePath: targetRelative.replaceAll("\\", "/"),
    size: info.size,
  };
}

export async function copyDownloadableFiles(
  markdownFiles: string[],
  sourcesDir: string,
  destinationDir: string,
): Promise<number> {
  const copied = new Set<string>();
  for (const sourceFile of markdownFiles) {
    const markdown = await Deno.readTextFile(sourceFile);
    for (const link of findDownloadableLinks(markdown)) {
      const file = await resolveDownloadableFile(
        link.url,
        sourceFile,
        sourcesDir,
      );
      if ("error" in file) {
        const reason = file.error === "missing"
          ? "file not found"
          : file.error === "too-large"
          ? `file exceeds the ${
            MAX_DOWNLOADABLE_FILE_SIZE / (1024 * 1024)
          } MiB limit`
          : file.error === "outside-sources"
          ? "file must be inside sourcesDir"
          : "invalid URL encoding";
        throw new Error(
          `${sourceFile}:${link.line}:${link.column}: ${reason}: ${link.url}`,
        );
      }
      const destination = join(destinationDir, ...file.relativePath.split("/"));
      if (copied.has(destination)) continue;
      await Deno.mkdir(dirname(destination), { recursive: true });
      await Deno.copyFile(file.path, destination);
      copied.add(destination);
    }
  }
  return copied.size;
}
