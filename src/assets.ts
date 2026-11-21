/**
 * Asset loader that works both locally (file://) and from the JSR cache (https://).
 *
 * Assets are published to JSR (see publish.include in deno.json).
 * We resolve the asset URL relative to this module (new URL(…, import.meta.url))
 * and use fetch() to
 * load the content — fetch works with file://, https:// and jsr: URLs, unlike
 * Deno.readTextFile() which only accepts local files.
 */

/**
 * URL of an asset, relative to this module. `new URL(…, import.meta.url)`
 * behaves like `import.meta.resolve` for relative paths, but JSR does not try
 * to rewrite it at publish time, so a dynamic asset name gives no
 * "unanalyzable import.meta.resolve" warning.
 */
function assetUrl(assetName: string): string {
  return new URL(`../assets/${assetName}`, import.meta.url).href;
}

/** Cache for loaded asset content (per asset name, once per process). */
const _assetCache = new Map<string, string>();

/**
 * Loads the text content of an asset from the assets/ directory.
 * @param assetName File name relative to the assets/ directory (e.g. "brightspacosaurus.css")
 * @returns The text content of the asset file
 */
export async function loadAssetText(assetName: string): Promise<string> {
  const cached = _assetCache.get(assetName);
  if (cached !== undefined) return cached;

  const url = assetUrl(assetName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Cannot load asset: ${assetName} (${url}) — status ${response.status}`,
    );
  }
  const text = await response.text();
  _assetCache.set(assetName, text);
  return text;
}

/**
 * Loads the binary content of an asset (for example a font) from the assets/
 * directory. Works with file://, https:// and jsr: URLs, like loadAssetText.
 * @param assetName File name relative to the assets/ directory
 */
export async function loadAssetBytes(assetName: string): Promise<Uint8Array> {
  const url = assetUrl(assetName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Cannot load asset: ${assetName} (${url}) — status ${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Loads demo content from this installed package, including binary images. */
export async function loadDemoCourseBytes(path: string): Promise<Uint8Array> {
  const url = new URL(`../examples/demo-course/${path}`, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Cannot load demo file: ${path} (${url}) — status ${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** The folder of this process and the files in it, by asset name (spec *Asset loading*, rules M1-M3). */
const materialized = new Map<string, Promise<string>>();
let materializedDir: Promise<string> | undefined;
let removeOnExit = false;

/** Remove the folder when the process ends, also after an uncaught error (rule M3). */
function removeFolderOnExit(): void {
  if (removeOnExit) return;
  removeOnExit = true;
  globalThis.addEventListener("unload", () => {
    // `unload` handlers cannot await, so the folder is removed synchronously.
    const dir = lastDir;
    if (!dir) return;
    try {
      Deno.removeSync(dir, { recursive: true });
    } catch {
      // Already removed by disposeMaterializedAssets().
    }
  });
}
let lastDir: string | undefined;

/**
 * Materializes an asset to a temporary local file and returns the path.
 * Needed for external tools such as pandoc that require an actual file path on disk
 * (--include-in-header, --lua-filter) and do not accept a URL or stdin content.
 *
 * All assets of a process go in one temporary folder, under their own name, and the
 * same asset gives the same path again. The folder is removed when the process ends
 * and by {@link disposeMaterializedAssets}; callers delete nothing themselves.
 *
 * @param assetName File name relative to the assets/ directory, without a path
 * @returns Absolute path to a temporary file containing the asset content
 */
export function materializeAsset(assetName: string): Promise<string> {
  if (
    !assetName || assetName === ".." || /[\\/]/.test(assetName) ||
    assetName.includes("..")
  ) {
    return Promise.reject(
      new Error(
        `Invalid asset name '${assetName}': use a file name without a path.`,
      ),
    );
  }
  const known = materialized.get(assetName);
  if (known) return known;
  const written = (async () => {
    const text = await loadAssetText(assetName);
    materializedDir ??= Deno.makeTempDir({ prefix: "bso-assets-" }).then(
      (dir) => {
        lastDir = dir;
        removeFolderOnExit();
        return dir;
      },
    );
    const path = `${await materializedDir}/${assetName}`;
    await Deno.writeTextFile(path, text);
    return path;
  })();
  // A failed write must not be remembered: the next call tries again.
  written.catch(() => materialized.delete(assetName));
  materialized.set(assetName, written);
  return written;
}

/**
 * Remove the temporary folder of {@link materializeAsset} now. A later call makes a new
 * folder. Safe to call when nothing was written.
 */
export async function disposeMaterializedAssets(): Promise<void> {
  const dir = materializedDir;
  materialized.clear();
  materializedDir = undefined;
  lastDir = undefined;
  if (!dir) return;
  try {
    await Deno.remove(await dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

/**
 * Reads the package version from deno.json (works locally and from the JSR cache).
 *
 * Uses a static import.meta.resolve() (which JSR can analyze) + fetch(), like loadAssetText, so it
 * works with file://, https:// and jsr: URLs. deno.json is included in
 * publish.include, so it is available from the JSR cache.
 *
 * @returns The version string, or "unknown" if it cannot be determined.
 */
export async function loadPackageVersion(): Promise<string> {
  try {
    const url = import.meta.resolve("../deno.json");
    const response = await fetch(url);
    if (!response.ok) return "unknown";
    const json = await response.json();
    return typeof json.version === "string" ? json.version : "unknown";
  } catch {
    return "unknown";
  }
}
