import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { dirname, resolve } from "@std/path";
import JSZip from "jszip";
import { measureSlides } from "../src/pptx/browser.ts";
import {
  assembleRenderedPptx,
  exportRenderedPptx,
} from "../src/pptx/rendered.ts";
import { DEFAULT_SOURCE_NOTICE } from "../src/pptx/settings.ts";
import { repositorySourceUrl } from "../src/pptx/source-link.ts";
import { benchmarkDeck } from "./fixtures/pptx-benchmark.ts";
import { parseDeck } from "../src/pptx/mod.ts";
import { Buffer } from "node:buffer";

const root = Deno.cwd();
const code = "const answer = items.map((item) => item.id);";
// Fixed content manifest, independent of the extraction implementation.
const html = `<!doctype html><html><head><title>Rendered fixture</title><style>
body{margin:0}body > svg > foreignObject > section{font:28px Arial;color:#123456;background:white;box-sizing:border-box;padding:40px;width:1280px;height:720px}
h1{font-size:44px}pre{font:18px monospace;transform:scale(.75);transform-origin:top left}a{color:blue}
section::after{content:attr(data-marpit-pagination);position:absolute;right:30px;bottom:20px;font:18px Arial}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">
<section xmlns="http://www.w3.org/1999/xhtml" id="1" data-marpit-pagination="1"><h1>Fixture title</h1><p>Native text under an SVG ancestor.</p><pre><code>${code}</code></pre><a href="#2">Next slide</a></section>
</foreignObject></svg>
<svg xmlns="http://www.w3.org/2000/svg" data-marpit-svg="" viewBox="0 0 1280 720"><foreignObject width="1280" height="720">
<section xmlns="http://www.w3.org/1999/xhtml" id="2" data-marpit-pagination="Bijlage 1/1"><h1>Appendix</h1><p>Caption and references.</p><img width="80" height="40" src="data:image/svg+xml;base64,${
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect x="10" width="60" height="40" fill="red"/></svg>',
  )
}"></section>
</foreignObject></svg>
<div class="bespoke-marp-note" data-index="0">Teacher title note.</div><div class="bespoke-marp-note" data-index="1">Appendix note.</div></body></html>`;

async function fixture(run: (path: string) => Promise<void>, content = html) {
  await Deno.mkdir("build", { recursive: true });
  const dir = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "rendered-pptx-",
  });
  try {
    const path = `${dir}/deck.html`;
    await Deno.writeTextFile(path, content);
    await run(path);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("E2/E3/E4: both real browser exports preserve slides, notes, notice and links; only native has body text", async () => {
  await fixture(async (htmlPath) => {
    for (const mode of ["raster", "native"] as const) {
      const { slides } = await measureSlides({
        htmlPath,
        repoRoot: root,
        mode,
        notice: DEFAULT_SOURCE_NOTICE,
        sourceUrl: "https://github.com/example/course/blob/main/slides/deck.md",
      });
      assertEquals(slides.length, 2);
      assertEquals(slides.map((s) => s.notes), [
        "Teacher title note.",
        "Appendix note.",
      ]);
      if (mode === "native") {
        const all = slides[0].text.map((run) => run.text).join("\n");
        assertStringIncludes(all, "Native text under an SVG ancestor.");
        assertStringIncludes(all, code);
        assertStringIncludes(all, DEFAULT_SOURCE_NOTICE.split(";")[0]);
        const run = slides[0].text.find((run) => run.text.includes(code))!;
        assert(
          run.size < 18,
          "Measured code autoscaling must affect its PowerPoint font.",
        );
        const paragraph = slides[0].text.find((run) =>
          run.text.startsWith("Native text")
        )!;
        assert(
          Math.abs(paragraph.size - 28 * (720 - 64) / 720) < 0.1,
          "The notice must preserve Marp's direct-child theme selectors while scaling the title.",
        );
        assert(
          Math.abs(
            slides[0].text.find((run) => run.text === "1")!.size -
              18 * (720 - 64) / 720,
          ) < 0.1,
        );
        assertEquals(slides[1].images.length, 1);
        assert(
          slides[1].images[0].data.startsWith("data:image/png"),
          "Transparency must survive.",
        );
        assert(slides[1].text.some((run) => run.text === "Bijlage 1/1"));
      }
      const bytes = await assembleRenderedPptx(slides, { mode, notes: true });
      assertEquals(
        bytes,
        await assembleRenderedPptx(slides, { mode, notes: true }),
      );
      const zip = await JSZip.loadAsync(bytes);
      const first = await zip.file("ppt/slides/slide1.xml")!.async("string");
      const notes = await zip.file("ppt/notesSlides/notesSlide1.xml")!.async(
        "string",
      );
      const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async(
        "string",
      );
      assertStringIncludes(notes, "Teacher title note.");
      assertStringIncludes(rels, 'Target="slide2.xml"');
      assertStringIncludes(
        rels,
        "https://github.com/example/course/blob/main/slides/deck.md",
      );
      assertEquals(
        first.includes("Native text under an SVG ancestor."),
        mode === "native",
      );
      if (mode === "raster") {
        assertEquals((first.match(/<p:pic>/g) ?? []).length, 1);
        assertEquals((first.match(/<a:t>/g) ?? []).length, 0);
      }
      const student = await JSZip.loadAsync(
        await assembleRenderedPptx(slides, { mode, notes: false }),
      );
      assertEquals(
        (await student.file("ppt/notesSlides/notesSlide1.xml")!.async("string"))
          .includes("Teacher title note."),
        false,
      );
    }
  });
});

Deno.test("E4: disabling the notice leaves authored text intact and adds no source link", async () => {
  await fixture(async (htmlPath) => {
    const { slides } = await measureSlides({
      htmlPath,
      repoRoot: root,
      mode: "native",
      notice: "",
    });
    const all = slides[0].text.map((run) => run.text).join("\n");
    assertStringIncludes(all, code);
    assertEquals(all.includes("Gegenereerd"), false);
    assertEquals(slides[0].links.length, 1);
  });
});

Deno.test("E5: missing assets and native overflow are actionable errors", async () => {
  await fixture(async (htmlPath) => {
    await assertRejects(
      () =>
        measureSlides({ htmlPath, repoRoot: root, mode: "native", notice: "" }),
      Error,
      "image failed to load",
    );
  }, html.replace('src="data:image/svg+xml;base64,', 'src="missing-'));
  await fixture(
    async (htmlPath) => {
      await assertRejects(
        () =>
          measureSlides({
            htmlPath,
            repoRoot: root,
            mode: "native",
            notice: "",
          }),
        Error,
        "overflows",
      );
    },
    html.replace(
      "Native text under an SVG ancestor.",
      '<span style="position:absolute;left:1250px">This is outside the page</span>',
    ),
  );
});

Deno.test("E5: a missing pinned browser names the explicit install command", async () => {
  await fixture(async (htmlPath) => {
    await assertRejects(
      () =>
        measureSlides({
          htmlPath,
          repoRoot: dirname(htmlPath),
          mode: "raster",
          notice: "",
        }),
      Error,
      "deno task slides:browser",
    );
  });
});

Deno.test("E2/E3: the supported exporter preserves title metadata and returns separate teacher notes", async () => {
  await fixture(async (htmlPath) => {
    const result = await exportRenderedPptx({
      htmlPath,
      markdown: "# Rendered fixture",
      repoRoot: root,
      mode: "native",
      notes: false,
      notice: "",
    });
    assert(result.teacher);
    const student = await JSZip.loadAsync(result.bytes);
    const teacher = await JSZip.loadAsync(result.teacher);
    assertStringIncludes(
      await student.file("docProps/core.xml")!.async("string"),
      "Rendered fixture",
    );
    assertEquals(
      (await student.file("ppt/notesSlides/notesSlide1.xml")!.async("string"))
        .includes("Teacher title note."),
      false,
    );
    assertStringIncludes(
      await teacher.file("ppt/notesSlides/notesSlide1.xml")!.async("string"),
      "Teacher title note.",
    );
  });
});

Deno.test("E6: a small embedded PNG is not re-encoded in native export", async () => {
  const image = await Deno.readFile(
    "assets/brightspacosaurus-favicon-small.png",
  );
  const data = `data:image/png;base64,${btoa(String.fromCharCode(...image))}`;
  await fixture(async (htmlPath) => {
    const { slides } = await measureSlides({
      htmlPath,
      repoRoot: root,
      mode: "native",
      notice: "",
    });

    assertEquals(slides[1].images[0].data, data);
  }, html.replace(/data:image\/svg\+xml;base64,[^"]+/, data));
});

Deno.test("E6: cover images are cropped at their declared position, not stretched", async () => {
  const { PNG } = await import("pngjs");
  await fixture(
    async (htmlPath) => {
      const { slides } = await measureSlides({
        htmlPath,
        repoRoot: root,
        mode: "native",
        notice: "",
      });
      const image = slides[1].images[0];
      assertEquals([image.w, image.h], [40, 40]);
      const bytes = Uint8Array.from(
        atob(image.data.split(",")[1]),
        (value) => value.charCodeAt(0),
      );
      const decoded = PNG.sync.read(Buffer.from(bytes));
      assertEquals([decoded.width, decoded.height], [40, 40]);
      assertEquals(
        decoded.data[3],
        0,
        "Left-aligned crop keeps the transparent left border.",
      );
      assertEquals(decoded.data[(20 * 40 + 20) * 4 + 3], 255);
    },
    html.replace(
      'width="80" height="40" src=',
      'width="40" height="40" style="object-fit:cover;object-position:0% 50%" src=',
    ),
  );
});

Deno.test("E2/E5: assembly rejects empty decks, mixed sizes, missing captures and unresolved links", async () => {
  const slide = {
    width: 1280,
    height: 720,
    background: "FFFFFF",
    text: [],
    images: [],
    shapes: [],
    links: [],
    notes: "",
  };
  await assertRejects(
    () => assembleRenderedPptx([], { mode: "native", notes: false }),
    Error,
    "empty",
  );
  await assertRejects(
    () =>
      assembleRenderedPptx([slide, { ...slide, width: 640 }], {
        mode: "native",
        notes: false,
      }),
    Error,
    "dimensions differ",
  );
  await assertRejects(
    () => assembleRenderedPptx([slide], { mode: "raster", notes: false }),
    Error,
    "missing raster",
  );
  for (const target of ["#9", "file:///private", "#named"]) {
    await assertRejects(
      () =>
        assembleRenderedPptx([{
          ...slide,
          links: [{ x: 10, y: 10, w: 40, h: 20, target }],
        }], { mode: "native", notes: false }),
      Error,
      "PPTX link",
    );
  }
});

Deno.test("E2: the benchmark source has the fixed 30-slide, 100-bullet, 10-illustration manifest", () => {
  const parsed = parseDeck(benchmarkDeck());
  assertEquals(parsed.slides.length, 30);
  const blocks = parsed.slides.flatMap((slide) => slide.blocks);
  assertEquals(blocks.filter((block) => block.kind === "image").length, 10);
  assertEquals(
    blocks.flatMap((block) => block.kind === "list" ? block.items : []).length,
    100,
  );
  assertEquals(blocks.filter((block) => block.kind === "code").length, 9);
});

Deno.test("E4: source URLs use known Git metadata, strip credentials and never invent a provider", () => {
  const commit = "a".repeat(40);
  assertEquals(
    repositorySourceUrl(
      "git@github.com:example/course.git",
      commit,
      "slides/A B.md",
    ),
    `https://github.com/example/course/blob/${commit}/slides/A%20B.md`,
  );
  assertEquals(
    repositorySourceUrl(
      "https://user:password@gitlab.example.org/team/course.git",
      commit,
      "deck.md",
    ),
    `https://gitlab.example.org/team/course/-/blob/${commit}/deck.md`,
  );
  assertEquals(
    repositorySourceUrl("https://example.org/course.git", commit, "deck.md"),
    undefined,
  );
  assertEquals(
    repositorySourceUrl(
      "https://github.com/example/course.git",
      "main",
      "deck.md",
    ),
    undefined,
  );
  assertEquals(
    repositorySourceUrl(
      "https://github.com/example/course.git",
      commit,
      "../deck.md",
    ),
    undefined,
  );
});
