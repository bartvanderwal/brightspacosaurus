# ADR 025 — Pure JavaScript libraries to shrink images

## Status

Accepted

## Context

The slides of a course embed their images twice: in the self-contained HTML of the deck, as base64, and in the editable `.pptx`. A package of owe-1 was 155 MB, and about half of it was images at full size (#162). BSO has to shrink the embedded copies to a maximum width, and leave the source image alone.

Deno has no image library of its own: BSO only reads the size of an image (`image-size`). Shrinking needs a decoder and an encoder for PNG and JPEG, which means a new dependency.

### Criteria

- Works the same on macOS, Windows and Linux (x86 and ARM): no binary for one platform (the course teams use all of them).
- No network access while it runs: a build must work offline and with the smallest set of rights (ADR 008).
- Small, with few or no dependencies of its own, and no known open advisories (`deno audit`).
- It reads files that an author supplies, so it must not hang or crash on a broken file in a way that cannot be caught.

## Considered options

### Option A — `imagescript` (JSR, WebAssembly)

**Pros:** fast, one library for PNG, JPEG and more, maintained on JSR.

**Cons:** it loads its `.wasm` files with `fetch` from `jsr.io` every run, also when installed from JSR (measured: a run without rights fails with *Requires net access to "jsr.io:443"*). A build then needs internet and a right that the minimal list does not have, and it is not cached. About 2 MB, of which most is formats that BSO does not need (SVG, fonts, TIFF, GIF).

### Option B — `sharp` (npm, native)

**Pros:** fastest, best quality.

**Cons:** platform-specific binaries, installed per platform. Rejected by the owner: course teams work on macOS, Windows and Linux.

### Option C — `jimp` (npm, pure JavaScript)

**Pros:** no binaries, no network at run time.

**Cons:** a large tree of dependencies for what BSO needs.

### Option D — An external program (ImageMagick, `sips`)

**Cons:** not installed everywhere, not portable, another thing to explain. Rejected.

### Option E — `jpeg-js` and `pngjs` (npm, pure JavaScript), with an own resize

`jpeg-js` 0.4.4 has no dependencies and is 76 KB; `pngjs` 7.0.0 has none either and is 650 KB unpacked (with tests). Neither has an `os` or `cpu` restriction or a native build step. Both come from npm into the Deno cache and then work offline.

**Pros:** the same on every platform, no network at run time, small, and no right beyond reading and writing files. The resize (the average over blocks of pixels) is a few dozen lines of our own, with tests, and no third dependency.

**Cons:** slower than wasm or native code, and the JPEG quality is good but not the best. Both libraries are stable and old (last release October 2022 and February 2023), so a new advisory may take long to be fixed.

## Decision

**Option E.** BSO shrinks the embedded copies of PNG and JPEG images with `jpeg-js` and `pngjs`, with a resize of its own, to `slides.maxImageWidth` (default 1600 pixels). An image that is already narrower than the maximum is not enlarged or encoded again, SVG and GIF are left alone, the format of the source is kept (no guessing which image is a photo), and the source file is never changed.

After adding them, `deno audit` is run, and it is part of the release check. The same audit already reports `image-size@1.2.1` through `pptxgenjs`, which does not load it (pptxgenjs #1474); that finding is ignored with a reference, not hidden.

## Consequences

- Positive: builds work offline and on every platform, with no new right, and the packages get smaller (to be measured on the owe-1 slides, #162).
- Negative: an own piece of image code to test and keep, and two libraries that are not actively developed. If one of them gets an unfixed advisory, the choice is reconsidered (option A with `--allow-net=jsr.io`, or `jimp`).
- Not decided here: sharing an image between decks in one package (the second measure in #162), which does not fit a self-contained HTML file.

## Sources

- `imagescript` 1.3.0, `utils/wasm/zlib.js`, read from jsr.io: it loads the wasm with `fetch` when the module is not a local file.
- npm registry metadata of `jpeg-js` 0.4.4 and `pngjs` 7.0.0 (no dependencies, no `os` or `cpu` restriction), read on 26 October 2026.
- PptxGenJS issue #1474 and the pull requests #1473 and #1529.
