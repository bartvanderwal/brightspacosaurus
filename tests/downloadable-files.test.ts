import { assertEquals } from "@std/assert";
import { join, resolve } from "@std/path";
import {
  copyDownloadableFiles,
  findDownloadableLinks,
  MAX_DOWNLOADABLE_FILE_SIZE,
  resolveDownloadableFile,
} from "../src/downloadable-files.ts";

async function makeBuildTempDir(): Promise<string> {
  await Deno.mkdir("build", { recursive: true });
  // Absolute: a symlink target is resolved from the link's own folder.
  return resolve(
    await Deno.makeTempDir({ dir: "build", prefix: "downloads-" }),
  );
}

Deno.test("download link parser ignores folders and extensionless page links", () => {
  assertEquals(
    findDownloadableLinks(
      "[Folder](other-topic/)\n[Page](README)\n[Markdown](page.md)\n[Html](../week-2/les.html#part)\n[Zip](files/task.zip)",
    ).map(({ url }) => url),
    ["files/task.zip"],
  );
});

Deno.test("download file resolution rejects paths and symlinks outside sourcesDir", async () => {
  const root = await makeBuildTempDir();
  const sources = join(root, "lessons");
  const topic = join(sources, "topic");
  const sourceFile = join(topic, "lesson.md");
  const outsideFile = join(root, "outside.zip");
  try {
    await Deno.mkdir(topic, { recursive: true });
    await Deno.writeTextFile(sourceFile, "# Lesson");
    await Deno.writeFile(outsideFile, new Uint8Array([1]));
    await Deno.symlink(outsideFile, join(topic, "escape.zip"));

    assertEquals(
      await resolveDownloadableFile("../../outside.zip", sourceFile, sources),
      { error: "outside-sources" },
    );
    assertEquals(
      await resolveDownloadableFile("escape.zip", sourceFile, sources),
      { error: "outside-sources" },
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("download resolution enforces the size limit and copying deduplicates links", async () => {
  const root = await makeBuildTempDir();
  const sources = join(root, "lessons");
  const topic = join(sources, "topic");
  const sourceFile = join(topic, "lesson.md");
  const file = join(topic, "task.zip");
  const output = join(root, "output");
  try {
    await Deno.mkdir(topic, { recursive: true });
    await Deno.writeTextFile(
      sourceFile,
      "# Lesson\n\n[First](task.zip)\n[Again](task.zip)\n",
    );
    const handle = await Deno.open(file, { create: true, write: true });
    try {
      await handle.seek(MAX_DOWNLOADABLE_FILE_SIZE, Deno.SeekMode.Start);
      await handle.write(new Uint8Array([0]));
    } finally {
      handle.close();
    }
    assertEquals(
      await resolveDownloadableFile("task.zip", sourceFile, sources),
      { error: "too-large" },
    );

    await Deno.writeFile(file, new Uint8Array([1, 2, 3]));
    assertEquals(
      await resolveDownloadableFile("task.zip", sourceFile, sources),
      {
        path: file,
        relativePath: "topic/task.zip",
        size: 3,
      },
    );
    assertEquals(
      await copyDownloadableFiles([sourceFile], sources, output),
      1,
    );
    assertEquals(
      [...await Deno.readFile(join(output, "topic", "task.zip"))],
      [1, 2, 3],
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
