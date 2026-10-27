/**
 * Shrinks the copies of images that go into the slides and the pptx files
 * (ADR 025): PNG and JPEG are made at most `maxWidth` pixels wide, with pure
 * JavaScript libraries, so it works the same on every platform and without a
 * network. The source file is never changed. Anything that cannot or need not
 * be shrunk comes back as it was.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import jpeg from "jpeg-js";
import pngjs from "pngjs";

const { PNG } = pngjs;

/** The width that images of the slides are shrunk to, unless `slides.maxImageWidth` says otherwise. */
export const DEFAULT_MAX_IMAGE_WIDTH = 1600;

/**
 * The width that the pictures on a lesson page are shrunk to. The column of a lesson page in
 * Brightspace is about 600 pixels wide, so 1200 keeps a factor 2 for a sharp screen or a zoom
 * (spec *Pictures on a lesson page*, rule P1).
 */
export const LESSON_IMAGE_MAX_WIDTH = 1200;

/** More pixels than this are not decoded: a broken or hostile file could use all memory. */
const MAX_PIXELS = 100_000_000;

/**
 * The orientation of a JPEG from its Exif data, 1 when there is none. A picture
 * with another orientation shows turned only because of this tag, and a
 * re-encoded picture would lose it, so such a picture is left as it is.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1 && length >= 14) {
      const start = offset + 4;
      const exif = String.fromCharCode(...bytes.subarray(start, start + 4));
      if (exif === "Exif") {
        const tiff = start + 6;
        const little = bytes[tiff] === 0x49;
        const word = (at: number) =>
          little
            ? bytes[at] | (bytes[at + 1] << 8)
            : (bytes[at] << 8) | bytes[at + 1];
        const long = (at: number) =>
          little
            ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) |
              (bytes[at + 3] << 24)) >>> 0
            : ((bytes[at] << 24) | (bytes[at + 1] << 16) |
              (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
        const entries = word(tiff + long(tiff + 4));
        for (let i = 0; i < entries; i++) {
          const entry = tiff + long(tiff + 4) + 2 + i * 12;
          if (entry + 12 > bytes.length) break;
          if (word(entry) === 0x0112) return word(entry + 8) || 1;
        }
      }
    }
    offset += 2 + length;
  }
  return 1;
}

/**
 * RGBA pixels at a new width, by averaging the source pixels that fall in each
 * new pixel (a box filter), weighted by alpha so that transparent pixels do not
 * darken the edges.
 */
export function resizeRgba(
  data: Uint8Array,
  width: number,
  height: number,
  newWidth: number,
): { data: Uint8Array; width: number; height: number } {
  const newHeight = Math.max(1, Math.round(height * newWidth / width));
  const out = new Uint8Array(newWidth * newHeight * 4);
  const scaleX = width / newWidth;
  const scaleY = height / newHeight;
  for (let y = 0; y < newHeight; y++) {
    const y0 = y * scaleY;
    const y1 = Math.min(height, (y + 1) * scaleY);
    for (let x = 0; x < newWidth; x++) {
      const x0 = x * scaleX;
      const x1 = Math.min(width, (x + 1) * scaleX);
      let r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const at = (sy * width + sx) * 4;
          const alpha = data[at + 3] / 255;
          r += data[at] * alpha * w;
          g += data[at + 1] * alpha * w;
          b += data[at + 2] * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }
      const to = (y * newWidth + x) * 4;
      if (a > 0) {
        out[to] = Math.round(r / a);
        out[to + 1] = Math.round(g / a);
        out[to + 2] = Math.round(b / a);
      }
      out[to + 3] = Math.round(255 * a / weight);
    }
  }
  return { data: out, width: newWidth, height: newHeight };
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The image at most `maxWidth` pixels wide. It is returned unchanged when
 * `maxWidth` is 0, when the image is not a PNG or JPEG, is not wider than the
 * maximum, has a turned Exif orientation, cannot be decoded, or when the result
 * would not be smaller. The type and the pixels of the picture stay: nothing is
 * enlarged and nothing is guessed (a photo stays a JPEG, a diagram a PNG).
 */
export function shrinkImage(
  bytes: Uint8Array,
  mime: string,
  maxWidth: number,
): Uint8Array {
  if (!(maxWidth > 0)) return bytes;
  try {
    if (mime === "image/png") {
      const size = pngSize(bytes);
      if (!size || size.width <= maxWidth) return bytes;
      if (size.width * size.height > MAX_PIXELS) return bytes;
      const png = PNG.sync.read(Buffer.from(bytes));
      const resized = resizeRgba(png.data, png.width, png.height, maxWidth);
      const out = new PNG({ width: resized.width, height: resized.height });
      out.data = Buffer.from(resized.data);
      const encoded = new Uint8Array(
        PNG.sync.write(out, { colorType: 6, deflateLevel: 9 }),
      );
      return encoded.length < bytes.length ? encoded : bytes;
    }
    if (mime === "image/jpeg") {
      if (jpegOrientation(bytes) !== 1) return bytes;
      const image = jpeg.decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: MAX_PIXELS / 1_000_000,
        maxMemoryUsageInMB: 1024,
      });
      if (image.width <= maxWidth) return bytes;
      const resized = resizeRgba(
        image.data,
        image.width,
        image.height,
        maxWidth,
      );
      const encoded = new Uint8Array(
        jpeg.encode(
          { data: resized.data, width: resized.width, height: resized.height },
          85,
        ).data,
      );
      return encoded.length < bytes.length ? encoded : bytes;
    }
  } catch {
    // A file that cannot be decoded is embedded as it is, as before.
  }
  return bytes;
}
