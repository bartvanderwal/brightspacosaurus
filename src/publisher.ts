/**
 * The publication folder: the files that are published on purpose, in a
 * folder that is meant for version control, apart from the temporary build
 * output. `bso pack` copies the current package into `<publishDir>/brightspace/`
 * (removing older versions of that package) and the editable pptx files into
 * `<publishDir>/slides/`. It says what it copied and what it removed.
 *
 * @module
 */

import { basename, dirname, join, relative } from "@std/path";

/** Options of {@link publishPackages}. */
export interface PublishOptions {
  /** The build directory (`outputDir`): `content/` holds the pptx files. */
  buildDir: string;
  /** The publication folder. */
  publishDir: string;
  /** Package name, as in `<name>.v<version>.imscc`. */
  name: string;
  /** The packages just built, absolute paths. */
  packages: string[];
}

/** What {@link publishPackages} did. Paths are relative to `publishDir`. */
export interface PublishResult {
  copied: string[];
  removed: string[];
}

const PACKAGE_EXTENSIONS = [".d2l.zip", ".imscc"];

function packageExtension(fileName: string): string | undefined {
  return PACKAGE_EXTENSIONS.find((extension) => fileName.endsWith(extension));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The files of a package folder that belong to the package `name` but are
 * another version than `keep`. Only `<name>.v<version>.<extension>` with the
 * same extension counts, so nothing else in the folder is touched.
 */
export function staleVersions(
  files: string[],
  name: string,
  keep: string,
): string[] {
  const extension = packageExtension(keep);
  if (!extension) return [];
  const pattern = new RegExp(
    `^${escapeRegExp(name)}\\.v.+${escapeRegExp(extension)}$`,
  );
  return files.filter((file) => file !== keep && pattern.test(file)).sort();
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isFile) files.push(entry.name);
    }
  } catch {
    // The folder does not exist yet.
  }
  return files.sort();
}

async function pptxFiles(directory: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (current: string) => {
    for await (const entry of Deno.readDir(current)) {
      const path = join(current, entry.name);
      if (entry.isDirectory) await walk(path);
      else if (entry.isFile && entry.name.endsWith(".pptx")) found.push(path);
    }
  };
  try {
    await walk(directory);
  } catch {
    // No content folder: nothing to publish.
  }
  return found.sort();
}

/**
 * Copies the packages and the pptx files into the publication folder and
 * removes older versions of the packages.
 */
export async function publishPackages(
  options: PublishOptions,
): Promise<PublishResult> {
  const result: PublishResult = { copied: [], removed: [] };
  const brightspace = join(options.publishDir, "brightspace");
  await Deno.mkdir(brightspace, { recursive: true });
  for (const source of options.packages) {
    const fileName = basename(source);
    await Deno.copyFile(source, join(brightspace, fileName));
    result.copied.push(join("brightspace", fileName));
    for (
      const stale of staleVersions(
        await listFiles(brightspace),
        options.name,
        fileName,
      )
    ) {
      await Deno.remove(join(brightspace, stale));
      result.removed.push(join("brightspace", stale));
    }
  }
  const content = join(options.buildDir, "content");
  for (const source of await pptxFiles(content)) {
    const target = join(
      options.publishDir,
      "slides",
      relative(content, source),
    );
    await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.copyFile(source, target);
    result.copied.push(relative(options.publishDir, target));
  }
  return result;
}
