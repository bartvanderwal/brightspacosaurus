/**
 * The version of a package: the version of the course that the author sets, and
 * a short hash of the content as semver build metadata, `1.2.0+3f9c2a1` (see the
 * Software Guidebook, *Content version*, rules CV1-CV7). The same content gives the
 * same version, so building twice does not change the name of the package.
 *
 * @module
 */

import { join, relative } from "@std/path";

/** Lists the files below a directory, with `/` in the names; nothing when the directory does not exist. */
async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    let entries: Deno.DirEntry[];
    try {
      entries = [];
      for await (const entry of Deno.readDir(current)) entries.push(entry);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory) await visit(path);
      else if (entry.isFile) files.push(path);
    }
  };
  await visit(directory);
  return files;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** What goes into the hash: the folders of the build that hold the content (and the pptx files with speaker notes for the teacher), and the folders with sources that the build does not copy. */
export interface ContentHashInput {
  /** The build directory: its `content/` and `quiz/` folders count. */
  buildDir: string;
  /** Source folders that count as they are, such as the readers folder (the PDF made from it is not reproducible byte for byte). */
  sourceDirs: string[];
  /** The version of BSO: another BSO can make another package from the same sources. */
  bsoVersion: string;
}

/** The first seven hexadecimal digits of the hash of the content. */
export async function computeContentHash(
  input: ContentHashInput,
): Promise<string> {
  const entries: { name: string; file: string }[] = [];
  for (const folder of ["content", "quiz", "teacher-pptx"]) {
    const root = join(input.buildDir, folder);
    for (const file of await listFiles(root)) {
      entries.push({
        name: `build/${relative(input.buildDir, file).replaceAll("\\", "/")}`,
        file,
      });
    }
  }
  for (const [index, root] of input.sourceDirs.entries()) {
    for (const file of await listFiles(root)) {
      entries.push({
        name: `source${index}/${relative(root, file).replaceAll("\\", "/")}`,
        file,
      });
    }
  }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const lines = [`bso ${input.bsoVersion}`];
  for (const entry of entries) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await Deno.readFile(entry.file),
    );
    lines.push(`${entry.name}\0${hex(digest)}`);
  }
  const total = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(lines.join("\n")),
  );
  return hex(total).slice(0, 7);
}

/** `1.2.0` and `3f9c2a1` give `1.2.0+3f9c2a1`. */
export function withContentHash(version: string, hash: string): string {
  return `${version}+${hash}`;
}
