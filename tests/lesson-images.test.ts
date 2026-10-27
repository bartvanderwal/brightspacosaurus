import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Buffer } from "node:buffer";
import { join } from "@std/path";
import pngjs from "pngjs";
import { convertMarkdown, limitImageWidth } from "../src/markdown-converter.ts";
import { LESSON_IMAGE_MAX_WIDTH } from "../src/image-shrink.ts";

const { PNG } = pngjs;

// Spec *Pictures on a lesson page*, rules P1 and P2 (Software Guidebook, 7.14).

function noisePng(width: number, height: number): Uint8Array {
  const image = new PNG({ width, height });
  const data = new Uint8Array(width * height * 4);
  let seed = 4321;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = seed & 255;
    data[i + 1] = (seed >> 8) & 255;
    data[i + 2] = (seed >> 16) & 255;
    data[i + 3] = 255;
  }
  image.data = Buffer.from(data);
  return new Uint8Array(PNG.sync.write(image));
}

Deno.test("P1: a wide PNG on a lesson page is shrunk in the copy to 1200 pixels, and the source stays", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: "build",
    prefix: "lesson-images-",
  });
  try {
    const source = join(root, "src");
    await Deno.mkdir(join(source, "images"), { recursive: true });
    const wide = noisePng(1600, 100);
    await Deno.writeFile(join(source, "images", "wide.png"), wide);
    await Deno.writeFile(
      join(source, "images", "small.png"),
      noisePng(300, 50),
    );
    await Deno.writeTextFile(
      join(source, "lesson.md"),
      "# Lesson\n\n![Wide](images/wide.png)\n\n![Small](images/small.png)\n",
    );
    const result = await convertMarkdown({
      sourcePath: join(source, "lesson.md"),
      outputDir: join(root, "build"),
      repoRoot: root,
      baseDir: source,
    });
    const copied = result.copiedImages.find((path) =>
      path.endsWith("wide.png")
    )!;
    const decoded = PNG.sync.read(Buffer.from(await Deno.readFile(copied)));
    assertEquals(decoded.width, LESSON_IMAGE_MAX_WIDTH);
    assertEquals(decoded.height, 75);
    // The source is as it was, and a picture that is narrow enough is copied as it is.
    assertEquals(await Deno.readFile(join(source, "images", "wide.png")), wide);
    const small = result.copiedImages.find((path) =>
      path.endsWith("small.png")
    )!;
    assertEquals(
      PNG.sync.read(Buffer.from(await Deno.readFile(small))).width,
      300,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("P2: every picture in the page gets a style that keeps it inside the page, and its own style is left alone", () => {
  assertEquals(
    limitImageWidth('<p><img src="a.png" alt="A"></p>'),
    '<p><img style="max-width:100%;height:auto" src="a.png" alt="A"></p>',
  );
  assertEquals(
    limitImageWidth('<img src="b.png" style="width:10px">'),
    '<img src="b.png" style="width:10px">',
  );
  assertStringIncludes(
    limitImageWidth("<img src=x><img src=y>"),
    'style="max-width:100%;height:auto" src=y',
  );
  assert(!limitImageWidth("<imgx src=x>").includes("style"));
});
