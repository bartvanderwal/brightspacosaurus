/**
 * Asset-loader die werkt zowel lokaal (file://) als vanuit de JSR-cache (https://).
 *
 * Assets worden meegepubliceerd naar JSR (zie publish.include in deno.json).
 * We gebruiken import.meta.resolve() om de asset-URL te bepalen en fetch() om
 * de inhoud te laden — fetch werkt met file://, https:// en jsr: URLs, in
 * tegenstelling tot Deno.readTextFile() dat alleen lokale bestanden accepteert.
 */

/** Cache voor geladen asset-inhoud (per asset-naam, eenmalig per proces). */
const _assetCache = new Map<string, string>();

/**
 * Laadt de tekstinhoud van een asset uit de assets/-map.
 * @param assetName Bestandsnaam relatief aan de assets/-map (bijv. "brightspacosaurus.css")
 * @returns De tekstinhoud van het asset-bestand
 */
export async function loadAssetText(assetName: string): Promise<string> {
  const cached = _assetCache.get(assetName);
  if (cached !== undefined) return cached;

  const url = import.meta.resolve(`../assets/${assetName}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kan asset niet laden: ${assetName} (${url}) — status ${response.status}`);
  }
  const text = await response.text();
  _assetCache.set(assetName, text);
  return text;
}

/**
 * Materialiseert een asset naar een tijdelijk lokaal bestand en retourneert het pad.
 * Nodig voor externe tools zoals pandoc die een echt bestandspad op schijf vereisen
 * (--include-in-header, --lua-filter) en geen URL of stdin-inhoud accepteren.
 *
 * @param assetName Bestandsnaam relatief aan de assets/-map
 * @returns Absoluut pad naar een tijdelijk bestand met de asset-inhoud
 */
export async function materializeAsset(assetName: string): Promise<string> {
  const text = await loadAssetText(assetName);
  // Behoud de extensie zodat pandoc/tex het bestandstype herkent
  const ext = assetName.includes(".") ? assetName.slice(assetName.lastIndexOf(".")) : "";
  const tmpPath = await Deno.makeTempFile({ prefix: "bss-asset-", suffix: ext });
  await Deno.writeTextFile(tmpPath, text);
  return tmpPath;
}
