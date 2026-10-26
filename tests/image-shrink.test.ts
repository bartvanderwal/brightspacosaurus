import { assert, assertEquals } from "@std/assert";
import { Buffer } from "node:buffer";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import {
  jpegOrientation,
  resizeRgba,
  shrinkImage,
} from "../src/image-shrink.ts";

const { PNG } = pngjs;

// Spec: ADR 025 and the Software Guidebook, *Slide images*, rules I1-I6.

/** A picture of coloured noise: it compresses badly, so a smaller one is smaller in bytes too. */
function pixels(width: number, height: number, alpha = 255): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  let seed = 12345;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = seed & 255;
    data[i + 1] = (seed >> 8) & 255;
    data[i + 2] = (seed >> 16) & 255;
    data[i + 3] = alpha;
  }
  return data;
}

function png(width: number, height: number, alpha = 255): Uint8Array {
  const image = new PNG({ width, height });
  image.data = Buffer.from(pixels(width, height, alpha));
  return new Uint8Array(PNG.sync.write(image));
}

function jpg(width: number, height: number): Uint8Array {
  return new Uint8Array(
    jpeg.encode({ data: pixels(width, height), width, height }, 90).data,
  );
}

const sizeOfPng = (bytes: Uint8Array) => {
  const decoded = PNG.sync.read(Buffer.from(bytes));
  return { width: decoded.width, height: decoded.height };
};

Deno.test("I1: a PNG wider than the maximum is made that wide, with the same proportions, and is smaller", () => {
  const source = png(400, 200);
  const shrunk = shrinkImage(source, "image/png", 100);
  assertEquals(sizeOfPng(shrunk), { width: 100, height: 50 });
  assert(shrunk.length < source.length);
});

Deno.test("I1: a JPEG wider than the maximum is made that wide and stays a JPEG", () => {
  const source = jpg(400, 200);
  const shrunk = shrinkImage(source, "image/jpeg", 100);
  const decoded = jpeg.decode(shrunk, { useTArray: true });
  assertEquals([decoded.width, decoded.height], [100, 50]);
  assert(shrunk.length < source.length);
  assertEquals([shrunk[0], shrunk[1]], [0xff, 0xd8]);
});

Deno.test("I2: an image that is not wider than the maximum, or a maximum of 0, is returned as it was", () => {
  const small = png(80, 40);
  assert(shrinkImage(small, "image/png", 100) === small);
  assert(shrinkImage(small, "image/png", 80) === small);
  const wide = png(400, 200);
  assert(shrinkImage(wide, "image/png", 0) === wide);
  const photo = jpg(80, 40);
  assert(shrinkImage(photo, "image/jpeg", 100) === photo);
});

Deno.test("I3: other types and files that cannot be decoded are returned as they were", () => {
  const svg = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  assert(shrinkImage(svg, "image/svg+xml", 10) === svg);
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  assert(shrinkImage(gif, "image/gif", 10) === gif);
  const broken = png(400, 200).slice(0, 60);
  assert(shrinkImage(broken, "image/png", 100) === broken);
  const notJpeg = new Uint8Array([1, 2, 3, 4]);
  assert(shrinkImage(notJpeg, "image/jpeg", 2) === notJpeg);
});

Deno.test("I4: the same image gives the same bytes, and transparency stays", () => {
  const source = png(400, 200, 0);
  const first = shrinkImage(source, "image/png", 100);
  const second = shrinkImage(source, "image/png", 100);
  assertEquals(first, second);
  const decoded = PNG.sync.read(Buffer.from(first));
  assertEquals(decoded.data[3], 0);
  assertEquals(decoded.data[decoded.data.length - 1], 0);
});

Deno.test("I5: a JPEG with a turned Exif orientation is left as it is, because a new file would lose the turn", () => {
  const plain = jpg(400, 200);
  assertEquals(jpegOrientation(plain), 1);
  // An Exif block with the orientation tag 0x0112 set to 6, after the start marker.
  const exif = new Uint8Array([
    0xff,
    0xe1,
    0x00,
    0x22,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x06,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const turned = new Uint8Array([
    ...plain.slice(0, 2),
    ...exif,
    ...plain.slice(2),
  ]);
  assertEquals(jpegOrientation(turned), 6);
  assert(shrinkImage(turned, "image/jpeg", 100) === turned);
});

Deno.test("I6: resizing averages the pixels that fall in a new pixel, weighted by alpha", () => {
  // 2x2: red, red, blue, blue (all opaque) become one purple pixel.
  const opaque = new Uint8Array([
    255,
    0,
    0,
    255,
    255,
    0,
    0,
    255,
    0,
    0,
    255,
    255,
    0,
    0,
    255,
    255,
  ]);
  const one = resizeRgba(opaque, 2, 2, 1);
  assertEquals([...one.data], [128, 0, 128, 255]);
  // A transparent pixel does not darken its neighbour.
  const half = new Uint8Array([
    200,
    100,
    50,
    255,
    0,
    0,
    0,
    0,
    200,
    100,
    50,
    255,
    0,
    0,
    0,
    0,
  ]);
  const mixed = resizeRgba(half, 2, 2, 1);
  assertEquals([...mixed.data], [200, 100, 50, 128]);
});
