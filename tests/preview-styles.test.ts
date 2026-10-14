/**
 * Tests for the preview stylesheet that `bso preview` writes into the
 * Docusaurus app (#95).
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import fc from "fast-check";
import { loadAssetText } from "../src/assets.ts";
import { PREVIEW_STYLESHEET, writePreviewStylesheet } from "../src/preview-styles.ts";

async function makeApp(): Promise<string> {
  await Deno.mkdir("build", { recursive: true });
  return await Deno.makeTempDir({ dir: "build", prefix: "preview-styles-" });
}

Deno.test("writePreviewStylesheet writes the complete stylesheet and a gitignore", async () => {
  const app = await makeApp();
  try {
    const path = await writePreviewStylesheet(app);
    assertEquals(path, join(app, "src", "generated", PREVIEW_STYLESHEET));
    const css = await Deno.readTextFile(path);
    assertEquals(css, await loadAssetText("brightspacosaurus.css"));
    for (const selector of [".bso-quiz", ".bso-flashcards", ".bso-tabs", ".bso-copy-btn"]) {
      assertStringIncludes(css, selector);
    }
    assertEquals(
      await Deno.readTextFile(join(app, "src", "generated", ".gitignore")),
      "*\n",
    );
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});

Deno.test("writePreviewStylesheet is idempotent and only rewrites changed files", async () => {
  const app = await makeApp();
  try {
    const path = await writePreviewStylesheet(app);
    const before = (await Deno.stat(path)).mtime?.getTime();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writePreviewStylesheet(app);
    assertEquals((await Deno.stat(path)).mtime?.getTime(), before);
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});

Deno.test("writePreviewStylesheet replaces any stale stylesheet with the current one", async () => {
  const expected = await loadAssetText("brightspacosaurus.css");
  await fc.assert(
    fc.asyncProperty(fc.string({ maxLength: 200 }), async (stale) => {
      const app = await makeApp();
      try {
        const dir = join(app, "src", "generated");
        await Deno.mkdir(dir, { recursive: true });
        await Deno.writeTextFile(join(dir, PREVIEW_STYLESHEET), stale);
        await writePreviewStylesheet(app);
        assertEquals(await Deno.readTextFile(join(dir, PREVIEW_STYLESHEET)), expected);
      } finally {
        await Deno.remove(app, { recursive: true });
      }
    }),
    { numRuns: 100 },
  );
});

Deno.test("writePreviewStylesheet fails with the real error when the app directory cannot be written", async () => {
  const app = await makeApp();
  try {
    const blocker = join(app, "src");
    await Deno.writeTextFile(blocker, "a file where a directory is needed");
    let message = "";
    try {
      await writePreviewStylesheet(app);
    } catch (error) {
      message = (error as Error).message;
    }
    assertEquals(message.length > 0, true);
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});
