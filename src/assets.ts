/**
 * Asset loader that works both locally (file://) and from the JSR cache (https://).
 *
 * Assets are published to JSR (see publish.include in deno.json).
 * We use import.meta.resolve() to determine the asset URL and fetch() to
 * load the content — fetch works with file://, https:// and jsr: URLs, unlike
 * Deno.readTextFile() which only accepts local files.
 */

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

  const url = import.meta.resolve(`../assets/${assetName}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load asset: ${assetName} (${url}) — status ${response.status}`);
  }
  const text = await response.text();
  _assetCache.set(assetName, text);
  return text;
}

/**
 * Materializes an asset to a temporary local file and returns the path.
 * Needed for external tools such as pandoc that require an actual file path on disk
 * (--include-in-header, --lua-filter) and do not accept a URL or stdin content.
 *
 * @param assetName File name relative to the assets/ directory
 * @returns Absolute path to a temporary file containing the asset content
 */
export async function materializeAsset(assetName: string): Promise<string> {
  const text = await loadAssetText(assetName);
  // Keep the extension so pandoc/tex recognizes the file type
  const ext = assetName.includes(".") ? assetName.slice(assetName.lastIndexOf(".")) : "";
  const tmpPath = await Deno.makeTempFile({ prefix: "bss-asset-", suffix: ext });
  await Deno.writeTextFile(tmpPath, text);
  return tmpPath;
}
