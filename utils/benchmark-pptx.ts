import { join, resolve } from "@std/path";
import { renderPreviewSlides } from "../src/slides-preview.ts";
import { measureSlides, PLAYWRIGHT_VERSION } from "../src/pptx/browser.ts";
import { benchmarkDeck } from "../tests/fixtures/pptx-benchmark.ts";
import { loadPackageVersion } from "../src/assets.ts";
import { cpus } from "node:os";
import JSZip from "jszip";

const root = Deno.cwd();
const output = resolve("build/pptx-benchmark");
const sources = resolve("build/pptx-benchmark-sources");
await Deno.mkdir(output, { recursive: true });
await Deno.mkdir(sources, { recursive: true });
await Deno.writeTextFile(join(sources, "lesson.md"), "# Benchmark lesson\n");
await Deno.writeTextFile(join(sources, "deck.md"), benchmarkDeck());
const results: {
  mode: string;
  run: number;
  seconds: number;
  bytes: number;
  sha256: string;
}[] = [];
for (let run = 0; run < 4; run++) {
  for (const mode of ["raster", "native"] as const) {
    const start = performance.now();
    await renderPreviewSlides(
      {
        lessons: {
          "lesson.md": { decks: "build/pptx-benchmark-sources/deck.md" },
        },
        pptx: true,
        pptxMode: mode,
        disclaimer: "",
      },
      root,
      sources,
      "build/pptx-benchmark-static",
    );
    const seconds = (performance.now() - start) / 1000;
    const file = resolve("build/pptx-benchmark-static/slides/lesson/deck.pptx");
    const bytes = await Deno.readFile(file);
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const previous = results.find((result) => result.mode === mode);
    if (previous && previous.sha256 !== sha256) {
      throw new Error(`${mode}: repeated exports produced different bytes.`);
    }
    const zip = await JSZip.loadAsync(bytes);
    const slideParts = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name)
    );
    if (slideParts.length !== 30) {
      throw new Error(`${mode}: expected 30 slides, got ${slideParts.length}.`);
    }
    const xml = (await Promise.all(slideParts.map((name) =>
      zip.file(name)!.async("string")
    ))).join("\n");
    if (mode === "raster") {
      if ((xml.match(/<p:pic>/g) ?? []).length !== 30 || /<a:t>/.test(xml)) {
        throw new Error(
          "Raster must have 30 slide images and no native body text.",
        );
      }
    } else {
      const text = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/gs)].map((match) =>
        match[1]
      ).join("");
      const compact = text.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(
        /&amp;/g,
        "&",
      ).replace(/\s/g, "");
      for (let point = 1; point <= 100; point++) {
        if (
          !compact.includes(
            `Point${point}:verifytheobservableresultbeforechangingtheimplementation.`,
          )
        ) {
          throw new Error(`Native: bullet ${point} was not preserved in full.`);
        }
      }
      for (let section = 21; section < 30; section++) {
        if (!compact.includes(`constsection=${section};`)) {
          throw new Error(`Native: code of section ${section} is missing.`);
        }
      }
    }
    await Deno.writeFile(join(output, `${mode}.pptx`), bytes);
    results.push({ mode, run, seconds, bytes: bytes.length, sha256 });
    console.log(JSON.stringify(results.at(-1)));
  }
}
const browser = await measureSlides({
  repoRoot: root,
  htmlPath: resolve("build/pptx-benchmark-static/slides/lesson/index.html"),
  mode: "native",
  notice: "",
});
const report = {
  boundary:
    "Markdown → PPTX, including Marp, browser startup, assets, source notice, student and teacher files; first run per mode excluded from warm statistics.",
  fixture: {
    slides: 30,
    illustrations: 10,
    bullets: 100,
    fonts: ["Arial", "Courier New"],
    viewport: "1280x720",
    deviceScaleFactor: 1,
    maxImageWidth: 1600,
  },
  environment: {
    deno: Deno.version.deno,
    os: Deno.build.os,
    arch: Deno.build.arch,
    playwright: PLAYWRIGHT_VERSION,
    chromium: browser.browserVersion,
    bso: await loadPackageVersion(),
    cpu: cpus()[0]?.model,
    memory: Deno.systemMemoryInfo().total,
    osRelease: Deno.osRelease(),
  },
  results,
  summary: ["raster", "native"].map((mode) => {
    const runs = results.filter((r) => r.mode === mode && r.run > 0).sort((
      a,
      b,
    ) => a.seconds - b.seconds);
    return {
      mode,
      median: runs[1].seconds,
      min: runs[0].seconds,
      max: runs[2].seconds,
      bytes: runs[0].bytes,
    };
  }),
};
await Deno.writeTextFile(
  join(output, "results.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
