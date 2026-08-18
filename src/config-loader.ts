/**
 * Config Loader voor Brightspacosaurus.
 * Laadt, valideert en resolvet het configuratiebestand (brightspacosaurus.config.json).
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 5.7
 */

import { join, resolve } from "@std/path";
import type {
  BssConfig,
  CliOverrides,
  ResolvedConfig,
  ResolvedDocentenConfig,
} from "./types.ts";

/** Voorbeeldconfiguratie voor foutmeldingen en documentatie. */
export const EXAMPLE_CONFIG = `{
  "courseName": "Mijn Cursus",
  "version": "1.0.0",
  "sourcesDir": "bronmateriaal/lessen/",
  "readersDir": "bronmateriaal/readers/",
  "outputDir": "build/brightspace",
  "docentenHandleiding": {
    "inputFiles": ["docs/handleiding.md"],
    "outputName": "docentenhandleiding.pdf"
  }
}`;

/** Standaard naam voor het configuratiebestand. */
const CONFIG_FILENAME = "brightspacosaurus.config.json";

/**
 * Zoekt het configuratiebestand in de standaardlocatie of het opgegeven pad.
 * Retourneert het absolute pad of null als niet gevonden.
 */
export async function findConfigFile(
  repoRoot: string,
  explicitPath?: string,
): Promise<string | null> {
  if (explicitPath) {
    const absPath = explicitPath.startsWith("/")
      ? explicitPath
      : resolve(repoRoot, explicitPath);
    try {
      await Deno.stat(absPath);
      return absPath;
    } catch {
      throw new Error(
        `Configuratiebestand niet gevonden op opgegeven pad: ${explicitPath}`,
      );
    }
  }

  // Zoek in de standaardlocatie (repoRoot)
  const defaultPath = join(repoRoot, CONFIG_FILENAME);
  try {
    await Deno.stat(defaultPath);
    return defaultPath;
  } catch {
    return null;
  }
}

/**
 * Laadt en parst het configuratiebestand.
 * @throws Error als het bestand niet gelezen of geparseerd kan worden
 */
export async function loadConfig(configPath: string): Promise<BssConfig> {
  let content: string;
  try {
    content = await Deno.readTextFile(configPath);
  } catch {
    throw new Error(
      `Kan configuratiebestand niet lezen: ${configPath}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(
      `Ongeldige JSON in configuratiebestand ${configPath}: ${(e as Error).message}`,
    );
  }

  if (!validateConfig(parsed)) {
    // validateConfig throws — dit punt wordt niet bereikt
    throw new Error("Ongeldige configuratie");
  }

  return parsed;
}

/**
 * Valideert het configuratieobject tegen het verwachte schema.
 * @throws Error als verplichte velden ontbreken of ongeldig zijn
 */
export function validateConfig(config: unknown): config is BssConfig {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error(
      "Configuratie moet een JSON-object zijn.",
    );
  }

  const obj = config as Record<string, unknown>;

  // Verplichte velden
  const requiredFields = ["courseName", "version", "sourcesDir"] as const;
  for (const field of requiredFields) {
    if (typeof obj[field] !== "string" || (obj[field] as string).trim() === "") {
      throw new Error(
        `Verplicht veld '${field}' ontbreekt of is leeg in het configuratiebestand.`,
      );
    }
  }

  // Optionele string-velden valideren
  const optionalStringFields = [
    "readersDir",
    "assetsDir",
    "outputDir",
    "customCss",
    "name",
  ] as const;
  for (const field of optionalStringFields) {
    if (obj[field] !== undefined && typeof obj[field] !== "string") {
      throw new Error(
        `Optioneel veld '${field}' moet een string zijn als het is opgegeven.`,
      );
    }
  }

  // docentenHandleiding valideren als het aanwezig is
  if (obj.docentenHandleiding !== undefined) {
    if (
      typeof obj.docentenHandleiding !== "object" ||
      obj.docentenHandleiding === null ||
      Array.isArray(obj.docentenHandleiding)
    ) {
      throw new Error(
        "Veld 'docentenHandleiding' moet een object zijn.",
      );
    }

    const dh = obj.docentenHandleiding as Record<string, unknown>;
    if (!Array.isArray(dh.inputFiles) || dh.inputFiles.length === 0) {
      throw new Error(
        "Veld 'docentenHandleiding.inputFiles' moet een niet-lege array van strings zijn.",
      );
    }
    for (const file of dh.inputFiles) {
      if (typeof file !== "string") {
        throw new Error(
          "Alle items in 'docentenHandleiding.inputFiles' moeten strings zijn.",
        );
      }
    }
    if (dh.outputName !== undefined && typeof dh.outputName !== "string") {
      throw new Error(
        "Veld 'docentenHandleiding.outputName' moet een string zijn als het is opgegeven.",
      );
    }
    if (dh.outputDir !== undefined && typeof dh.outputDir !== "string") {
      throw new Error(
        "Veld 'docentenHandleiding.outputDir' moet een string zijn als het is opgegeven.",
      );
    }
  }

  return true;
}

/**
 * Genereert een slug uit een cursusnaam voor gebruik als bestandsnaam.
 * Bijv. "OWE 1 - Full Stack Engineering" → "owe-1-full-stack-engineering"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Merget CLI-overrides met het configuratiebestand en resolvet paden.
 * Merge-strategie: CLI-argument > Config_File > Standaardwaarde.
 * Alle relatieve paden worden geresolveerd naar absolute paden op basis van repoRoot.
 */
export function resolveConfig(
  config: BssConfig,
  cliOverrides: CliOverrides,
  repoRoot: string,
): ResolvedConfig {
  // sourcesDir: CLI wint van config (config is verplicht, dus altijd aanwezig)
  const sourcesDir = resolve(
    repoRoot,
    cliOverrides.sources ?? config.sourcesDir,
  );

  // outputDir: CLI wint van config, standaard = "build/brightspace"
  const outputDir = resolve(
    repoRoot,
    cliOverrides.output ?? config.outputDir ?? "build/brightspace",
  );

  // readersDir: alleen uit config, null als niet opgegeven
  const readersDir = config.readersDir
    ? resolve(repoRoot, config.readersDir)
    : null;

  // assetsDir: alleen uit config, null als niet opgegeven
  const assetsDir = config.assetsDir
    ? resolve(repoRoot, config.assetsDir)
    : null;

  // customCss: alleen uit config, null als niet opgegeven
  const customCss = config.customCss
    ? resolve(repoRoot, config.customCss)
    : null;

  // name: uit config of afgeleid van courseName
  const name = config.name ?? slugify(config.courseName);

  // docentenHandleiding: resolvet naar absolute paden als aanwezig
  let docentenHandleiding: ResolvedDocentenConfig | null = null;
  if (config.docentenHandleiding) {
    const dh = config.docentenHandleiding;
    docentenHandleiding = {
      inputFiles: dh.inputFiles.map((f) => resolve(repoRoot, f)),
      outputName: dh.outputName ?? "docentenhandleiding.pdf",
      outputDir: resolve(
        repoRoot,
        dh.outputDir ?? join(config.outputDir ?? "build/brightspace", "docenten"),
      ),
    };
  }

  return {
    sourcesDir,
    readersDir,
    assetsDir,
    outputDir,
    courseName: config.courseName,
    version: config.version,
    customCss,
    name,
    docentenHandleiding,
    repoRoot,
  };
}

/**
 * Fallback-resolutie wanneer geen configuratiebestand beschikbaar is,
 * maar wel een --sources CLI-argument is meegegeven.
 * Produceert een minimale ResolvedConfig met standaardwaarden.
 */
export function resolveFromCliOnly(
  cli: CliOverrides,
  repoRoot: string,
): ResolvedConfig {
  if (!cli.sources) {
    throw new Error(
      "Geen configuratiebestand gevonden en geen --sources argument opgegeven.",
    );
  }

  const sourcesDir = resolve(repoRoot, cli.sources);
  const outputDir = resolve(repoRoot, cli.output ?? "build/brightspace");

  return {
    sourcesDir,
    readersDir: null,
    assetsDir: null,
    outputDir,
    courseName: "Cursus",
    version: "0.0.0",
    customCss: null,
    name: "cursus",
    docentenHandleiding: null,
    repoRoot,
  };
}
