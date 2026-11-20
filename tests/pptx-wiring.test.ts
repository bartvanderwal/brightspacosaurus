import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, join, resolve } from "@std/path";
import {
  exportSlidesToContent,
  renderPreviewSlides,
  type SlidesRunner,
} from "../src/slides-preview.ts";
import type {
  RenderedPptxExporter,
  RenderedPptxRequest,
} from "../src/pptx/rendered.ts";

async function fixture(run: (root: string) => Promise<void>) {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "pptx-wiring-",
  });
  try {
    const write = async (path: string, value: string) => {
      await Deno.mkdir(dirname(join(root, path)), { recursive: true });
      await Deno.writeTextFile(join(root, path), value);
    };
    await write(
      "lessons/overview.md",
      "---\npptxMode: native\n---\n\n# Overview\n\n## 1. Topic\n\n- Root\n\n[Child](child.md)\n",
    );
    await write(
      "lessons/child.md",
      "---\npptxMode: raster\n---\n\n# Child\n\n## 1. Content\n\n- Nested\n",
    );
    await write(
      "decks/deck.md",
      "---\nslides: true\npptxMode: native\n---\n\n# Manual\n\n- Original\n\n<!-- Notes -->\n",
    );
    await write(
      "content/overview.html",
      "<html><body><h1>Overview</h1></body></html>",
    );
    // Keep tool preparation offline while exercising the public selection/render boundary.
    for (
      const [module, version] of [
        ["@marp-team/marp-cli", "4.5.1"],
        ["@xmldom/xmldom", "0.9.12"],
        ["katex", "0.18.2"],
      ]
    ) {
      await write(
        `marp-tools/node_modules/${module}/package.json`,
        JSON.stringify({ version }),
      );
    }
    await run(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

const runner: SlidesRunner = async (args) => {
  if (args[0] === "install") return;
  await Deno.writeTextFile(
    args[args.indexOf("--output") + 1],
    "<html><head></head><body></body></html>",
  );
};

// Spec *Rendered PowerPoint export*, E1 and E7: use the same boundary for all routes.
Deno.test("E1/E7: manual/generated/nested decks resolve only the root settings and rebuild after a mode change", async () => {
  await fixture(async (root) => {
    const requests: RenderedPptxRequest[] = [];
    const exporter: RenderedPptxExporter = (request) => {
      requests.push(request);
      return Promise.resolve({
        bytes: new Uint8Array([request.mode === "native" ? 1 : 2]),
        teacher: new Uint8Array([3]),
      });
    };
    // prepareTools checks patched versions after the injected install.
    await renderPreviewSlides(
      {
        lessons: {
          "overview.md": { generate: true, pptx: true, nest: "child.md" },
        },
        pptxMode: "raster",
      },
      root,
      "lessons",
      "static",
      runner,
      undefined,
      undefined,
      exporter,
    );
    assertEquals(requests[0].mode, "native");
    assertStringIncludes(requests[0].markdown, "Nested");
    requests.length = 0;
    await exportSlidesToContent(
      {
        lessons: {
          "overview.md": { decks: "decks/deck.md", nest: "child.md" },
        },
        pptx: true,
        pptxMode: "raster",
      },
      root,
      "lessons",
      "static",
      join(root, "content"),
      runner,
      undefined,
      exporter,
    );
    assertEquals(requests[0].mode, "native");
    assertStringIncludes(requests[0].markdown, "Nested");
    const file = join(root, "content/overview-deck.pptx");
    assertEquals(await Deno.readFile(file), new Uint8Array([1]));
    assertEquals(
      await Deno.readFile(join(root, "teacher-pptx/overview-deck.pptx")),
      new Uint8Array([3]),
    );
    await Deno.writeTextFile(
      join(root, "decks/deck.md"),
      "---\nslides: true\npptxMode: raster\n---\n\n# Manual\n\n- Original\n",
    );
    await exportSlidesToContent(
      {
        lessons: { "overview.md": { decks: "decks/deck.md" } },
        pptx: true,
        pptxMode: "native",
      },
      root,
      "lessons",
      "static",
      join(root, "content"),
      runner,
      undefined,
      exporter,
    );
    assertEquals(await Deno.readFile(file), new Uint8Array([2]));
    const html = await Deno.readTextFile(
      join(root, "content/overview-slides.html"),
    );
    assertStringIncludes(html, "Download pptx (raster)");
    assert(
      requests.every((request) => !request.sourceUrl?.startsWith("file:")),
    );
    requests.length = 0;
    await renderPreviewSlides(
      {
        lessons: { "overview.md": { decks: "decks/deck.md" } },
        pptx: false,
        pptxMode: "native",
      },
      root,
      "lessons",
      "static",
      runner,
      undefined,
      undefined,
      exporter,
    );
    assertEquals(requests.length, 0);
  });
});
