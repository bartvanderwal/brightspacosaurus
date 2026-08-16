/**
 * MarpExporter: zet docentenslides om naar Marp-compatible Markdown.
 * De bronbestanden blijven leidend; de uitvoer is afgeleid materiaal in build/.
 */

import { basename, dirname, join, relative, resolve } from "@std/path";

export interface MarpExportOptions {
  sourceDir: string;
  outputDir: string;
  repoRoot: string;
}

export interface MarpExportResult {
  exportedFiles: string[];
}

const DEFAULT_SOURCE_DIR =
  "6.2.Onderwijsmateriaal-voor-docenten/6.2.4.Instructiemateriaal";
const DEFAULT_OUTPUT_DIR = "build/marp-slides";

function assertWithinRoot(absPath: string, repoRoot: string): void {
  const rel = relative(repoRoot, absPath);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    const err = new Error(`Pad buiten repository-root geweigerd: ${absPath} (root: ${repoRoot})`);
    (err as Error & { exitCode: number }).exitCode = 3;
    throw err;
  }
}

async function collectSlideFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    for await (const entry of Deno.readDir(currentDir)) {
      const path = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(path);
      } else if (entry.isFile && /^slides-les-.+\.md$/.test(entry.name)) {
        files.push(path);
      }
    }
  }

  await walk(dir);
  files.sort();
  return files;
}

function stripMarkdownFormatting(value: string): string {
  return value.replace(/`/g, "").replace(/\*\*/g, "").trim();
}

function toMarpTitle(slideHeading: string): string {
  const match = slideHeading.match(/^##\s+Slide\s+\d+\s*[-–—:]?\s*(.*)$/i);
  const title = match?.[1]?.trim() || stripMarkdownFormatting(slideHeading.replace(/^##\s+/, ""));
  return `# ${title}`;
}

function convertSpeakerNotes(lines: string[]): string[] {
  const converted: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isSpeakerNotesHeading =
      /^###\s+Speaker notes\b/i.test(line.trim()) ||
      /^Spreeknotitie docent:\s*$/i.test(line.trim());

    if (!isSpeakerNotesHeading) {
      converted.push(line);
      i += 1;
      continue;
    }

    const notes: string[] = [];
    i += 1;
    while (i < lines.length) {
      notes.push(lines[i]);
      i += 1;
    }

    while (notes.length > 0 && notes[0].trim() === "") notes.shift();
    while (notes.length > 0 && notes[notes.length - 1].trim() === "") notes.pop();

    if (notes.length > 0) {
      converted.push("<!--");
      converted.push("Speaker notes:");
      converted.push(...notes);
      converted.push("-->");
    }
  }

  return converted;
}

function hasMarpFrontMatter(content: string): boolean {
  return /^---\s*\n[\s\S]*?\bmarp:\s*true\b[\s\S]*?\n---\s*\n/.test(content);
}

export function convertSlidesToMarp(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const titleLine = lines.find((line) => line.startsWith("# ")) ?? "# Slides";
  const slideHeadingIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^##\s+Slide\s+\d+\b/i.test(line))
    .map(({ index }) => index);

  const frontMatter = [
    "---",
    "marp: true",
    "theme: default",
    "paginate: true",
    `title: "${stripMarkdownFormatting(titleLine.replace(/^#\s+/, "")).replace(/"/g, '\\"')}"`,
    "---",
    "",
  ];

  if (hasMarpFrontMatter(normalized)) {
    return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  }

  if (slideHeadingIndexes.length === 0) {
    return `${frontMatter.join("\n")}${normalized}`;
  }

  const output: string[] = [...frontMatter];
  slideHeadingIndexes.forEach((start, slideIndex) => {
    const end = slideHeadingIndexes[slideIndex + 1] ?? lines.length;
    const slideLines = lines.slice(start, end);
    const heading = slideLines[0];
    const rawBody = slideLines.slice(1).filter((line) => line.trim() !== "---");
    const body = convertSpeakerNotes(rawBody);

    if (slideIndex > 0) {
      output.push("---");
      output.push("");
    }
    output.push(toMarpTitle(heading));
    output.push(...body);
    while (output.length > 0 && output[output.length - 1].trim() === "") output.pop();
    output.push("");
    output.push("");
  });

  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

export async function exportMarpSlides(options: MarpExportOptions): Promise<MarpExportResult> {
  const repoRoot = resolve(options.repoRoot);
  const sourceDir = resolve(options.sourceDir);
  const outputDir = resolve(options.outputDir);

  assertWithinRoot(sourceDir, repoRoot);
  assertWithinRoot(outputDir, repoRoot);

  const sourceFiles = await collectSlideFiles(sourceDir);
  const exportedFiles: string[] = [];

  for (const sourcePath of sourceFiles) {
    const content = await Deno.readTextFile(sourcePath);
    const marpContent = convertSlidesToMarp(content);
    const relDir = relative(sourceDir, dirname(sourcePath));
    const outputPath = join(outputDir, relDir, basename(sourcePath));
    await Deno.mkdir(dirname(outputPath), { recursive: true });
    await Deno.writeTextFile(outputPath, marpContent);
    exportedFiles.push(outputPath);
  }

  exportedFiles.sort();
  return { exportedFiles };
}

function argValue(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    const err = new Error(`Ontbrekende waarde voor ${name}`);
    (err as Error & { exitCode: number }).exitCode = 1;
    throw err;
  }
  return value;
}

if (import.meta.main) {
  try {
    const repoRoot = resolve(join(import.meta.dirname ?? ".", "..", "..", ".."));
    const sourceDir = argValue(Deno.args, "--sources", join(repoRoot, DEFAULT_SOURCE_DIR));
    const outputDir = argValue(Deno.args, "--output", join(repoRoot, DEFAULT_OUTPUT_DIR));
    const result = await exportMarpSlides({ sourceDir, outputDir, repoRoot });
    console.log(`Marp-export voltooid: ${result.exportedFiles.length} bestand(en) naar ${outputDir}`);
  } catch (error) {
    const err = error as Error & { exitCode?: number };
    console.error(err.message);
    Deno.exit(err.exitCode ?? 3);
  }
}
