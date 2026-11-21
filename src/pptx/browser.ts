import { join, resolve, toFileUrl } from "@std/path";
import { loadAssetText } from "../assets.ts";
import type { PptxMode } from "./settings.ts";

export const PLAYWRIGHT_VERSION = "1.63.0";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MeasuredText extends Box {
  text: string;
  size: number;
  font: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
}

export interface MeasuredSlide {
  width: number;
  height: number;
  background: string;
  text: MeasuredText[];
  images: (Box & { data: string; framed?: boolean })[];
  shapes: (Box & { fill: string; radius?: boolean })[];
  links: (Box & { target: string })[];
  notes: string;
  raster?: string;
}

export interface BrowserExportOptions {
  htmlPath: string;
  repoRoot: string;
  mode: PptxMode;
  notice: string;
  sourceUrl?: string;
  maxImageWidth?: number;
}

export async function measureSlides(
  options: BrowserExportOptions,
): Promise<{ slides: MeasuredSlide[]; browserVersion: string; title: string }> {
  const { chromium } = await import("playwright");
  const cache = resolve(options.repoRoot, "build/slide-browser");
  // Use exactly the revision required by the pinned runtime, never a global browser.
  const suffix = chromium.executablePath().match(
    /[/\\](chromium-\d+)[/\\](.*)$/,
  );
  if (!suffix) {
    throw new Error("Cannot resolve the pinned Chromium executable.");
  }
  const executablePath = join(cache, suffix[1], suffix[2]);
  try {
    await Deno.stat(executablePath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    throw new Error(
      `Slide browser missing: ${executablePath}. Run 'deno task slides:browser' from the course repository (or 'deno run -A jsr:@bartvanderwal/brightspacosaurus/slide-browser').`,
    );
  }
  const scratch = resolve(options.repoRoot, "build/browser-tmp");
  await Deno.mkdir(scratch, { recursive: true });
  const profile = await Deno.makeTempDir({ dir: scratch, prefix: "pptx-" });
  // Playwright runs in this process and puts its artifacts in the system temp
  // folder, which a restricted write permission (the preview task) would ask
  // about on every start. Pointing it at the scratch folder keeps all writes
  // inside the build directory.
  const previousTemp = Deno.env.get("TMPDIR");
  Deno.env.set("TMPDIR", scratch);
  try {
    const context = await chromium.launchPersistentContext(profile, {
      executablePath,
      headless: true,
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      colorScheme: "light",
      reducedMotion: "reduce",
      args: ["--allow-file-access-from-files"],
      env: { ...Deno.env.toObject(), TMPDIR: scratch },
    });
    try {
      const failures: string[] = [];
      const page = await context.newPage();
      page.on("requestfailed", (request) => failures.push(request.url()));
      page.on("response", (response) => {
        if (response.status() >= 400) {
          failures.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.emulateMedia({ media: "print" });
      await page.goto(toFileUrl(resolve(options.htmlPath)).href, {
        waitUntil: "networkidle",
      });
      await page.addScriptTag({
        content: await loadAssetText("pptx-extract.js"),
      });
      const slides = await page.evaluate<MeasuredSlide[]>(
        `globalThis.bsoExtractSlides(${
          JSON.stringify({
            notice: options.notice,
            sourceUrl: options.sourceUrl,
            maxImageWidth: options.maxImageWidth ?? 1600,
            native: options.mode === "native",
          })
        })`,
      );
      if (failures.length) {
        throw new Error(
          `Slide assets failed to load: ${[...new Set(failures)].join(", ")}`,
        );
      }
      if (!slides.length) throw new Error("No rendered Marp slides found.");
      if (options.mode === "raster") {
        for (const [index, slide] of slides.entries()) {
          const bytes = await page.locator(`[data-bso-export-slide="${index}"]`)
            .screenshot({
              type: "png",
              animations: "disabled",
            });
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 0x8000),
            );
          }
          slide.raster = `image/png;base64,${btoa(binary)}`;
        }
      }
      return {
        slides,
        browserVersion: context.browser()?.version() ?? "unknown",
        title: await page.title(),
      };
    } finally {
      await context.close();
    }
  } finally {
    if (previousTemp === undefined) Deno.env.delete("TMPDIR");
    else Deno.env.set("TMPDIR", previousTemp);
    await Deno.remove(profile, { recursive: true });
  }
}
