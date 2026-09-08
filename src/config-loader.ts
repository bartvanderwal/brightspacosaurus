/**
 * Config Loader for Brightspacosaurus.
 * Loads, validates and resolves the configuration file (brightspacosaurus.config.json).
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 5.7
 */

import { join, resolve } from "@std/path";
import type {
  BsoConfig,
  CliOverrides,
  ResolvedConfig,
  ResolvedDiagramConfig,
  ResolvedDocentenConfig,
} from "./types.ts";

/** Allowed values for the `diagrams.output` field. */
const DIAGRAM_OUTPUT_VALUES = [
  "img-html-base64",
  "inline-svg",
  "img-base64",
  "object-base64",
] as const;

/** Example configuration for error messages and documentation. */
export const EXAMPLE_CONFIG = `{
  "courseName": "My Course",
  "version": "1.0.0",
  "sourcesDir": "bronmateriaal/lessen/",
  "readersDir": "bronmateriaal/readers/",
  "outputDir": "build/brightspace",
  "docusaurusDir": "scripts/docusaurus",
  "docentenHandleiding": {
    "inputFiles": ["docs/handleiding.md"],
    "outputName": "docentenhandleiding.pdf"
  },
  "diagrams": {
    "krokiUrl": "https://kroki.io",
    "output": "img-html-base64",
    "failOnError": true
  }
}`;

/** Default name for the configuration file. */
const CONFIG_FILENAME = "brightspacosaurus.config.json";

/**
 * Looks for the configuration file at the default location or the given path.
 * Returns the absolute path or null if not found.
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
        `Configuration file not found at the given path: ${explicitPath}`,
      );
    }
  }

  // Look at the default location (repoRoot)
  const defaultPath = join(repoRoot, CONFIG_FILENAME);
  try {
    await Deno.stat(defaultPath);
    return defaultPath;
  } catch {
    return null;
  }
}

/**
 * Loads and parses the configuration file.
 * @throws Error if the file cannot be read or parsed
 */
export async function loadConfig(configPath: string): Promise<BsoConfig> {
  let content: string;
  try {
    content = await Deno.readTextFile(configPath);
  } catch {
    throw new Error(
      `Cannot read configuration file: ${configPath}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(
      `Invalid JSON in configuration file ${configPath}: ${(e as Error).message}`,
    );
  }

  if (!validateConfig(parsed)) {
    // validateConfig throws — this point is not reached
    throw new Error("Invalid configuration");
  }

  return parsed;
}

/**
 * Validates the configuration object against the expected schema.
 * @throws Error if required fields are missing or invalid
 */
export function validateConfig(config: unknown): config is BsoConfig {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error(
      "Configuration must be a JSON object.",
    );
  }

  const obj = config as Record<string, unknown>;

  // Required fields
  const requiredFields = ["courseName", "version", "sourcesDir"] as const;
  for (const field of requiredFields) {
    if (typeof obj[field] !== "string" || (obj[field] as string).trim() === "") {
      throw new Error(
        `Required field '${field}' is missing or empty in the configuration file.`,
      );
    }
  }

  // Validate optional string fields
  const optionalStringFields = [
    "readersDir",
    "assetsDir",
    "outputDir",
    "customCss",
    "name",
    "docusaurusDir",
  ] as const;
  for (const field of optionalStringFields) {
    if (obj[field] !== undefined && typeof obj[field] !== "string") {
      throw new Error(
        `Optional field '${field}' must be a string if it is provided.`,
      );
    }
  }

  // Validate docentenHandleiding if it is present
  if (obj.docentenHandleiding !== undefined) {
    if (
      typeof obj.docentenHandleiding !== "object" ||
      obj.docentenHandleiding === null ||
      Array.isArray(obj.docentenHandleiding)
    ) {
      throw new Error(
        "Field 'docentenHandleiding' must be an object.",
      );
    }

    const dh = obj.docentenHandleiding as Record<string, unknown>;
    if (!Array.isArray(dh.inputFiles) || dh.inputFiles.length === 0) {
      throw new Error(
        "Field 'docentenHandleiding.inputFiles' must be a non-empty array of strings.",
      );
    }
    for (const file of dh.inputFiles) {
      if (typeof file !== "string") {
        throw new Error(
          "All items in 'docentenHandleiding.inputFiles' must be strings.",
        );
      }
    }
    if (dh.outputName !== undefined && typeof dh.outputName !== "string") {
      throw new Error(
        "Field 'docentenHandleiding.outputName' must be a string if it is provided.",
      );
    }
    if (dh.outputDir !== undefined && typeof dh.outputDir !== "string") {
      throw new Error(
        "Field 'docentenHandleiding.outputDir' must be a string if it is provided.",
      );
    }
  }

  // Validate diagrams if it is present
  if (obj.diagrams !== undefined) {
    if (
      typeof obj.diagrams !== "object" ||
      obj.diagrams === null ||
      Array.isArray(obj.diagrams)
    ) {
      throw new Error(
        "Field 'diagrams' must be an object.",
      );
    }

    const diagrams = obj.diagrams as Record<string, unknown>;

    if (diagrams.krokiUrl !== undefined) {
      if (typeof diagrams.krokiUrl !== "string") {
        throw new Error(
          "Field 'diagrams.krokiUrl' must be a string if it is provided.",
        );
      }
      try {
        new URL(diagrams.krokiUrl);
      } catch {
        throw new Error(
          `Field 'diagrams.krokiUrl' must be a valid URL: '${diagrams.krokiUrl}'.`,
        );
      }
    }

    if (
      diagrams.output !== undefined &&
      !DIAGRAM_OUTPUT_VALUES.includes(diagrams.output as typeof DIAGRAM_OUTPUT_VALUES[number])
    ) {
      throw new Error(
        `Field 'diagrams.output' must be one of: ${DIAGRAM_OUTPUT_VALUES.join(", ")}.`,
      );
    }

    if (diagrams.failOnError !== undefined && typeof diagrams.failOnError !== "boolean") {
      throw new Error(
        "Field 'diagrams.failOnError' must be a boolean if it is provided.",
      );
    }
  }

  return true;
}

/**
 * Generates a slug from a course name for use as a file name.
 * E.g. "OWE 1 - Full Stack Engineering" → "owe-1-full-stack-engineering"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Default diagram settings, used when no `diagrams` config is provided. */
const DEFAULT_DIAGRAM_CONFIG: ResolvedDiagramConfig = {
  krokiUrl: "https://kroki.io",
  output: "img-html-base64",
  failOnError: true,
  locale: "nl",
};

/**
 * Resolves the optional `diagrams` config, filling in defaults for any
 * missing field. `locale` is not (yet) a user-facing config field and always
 * defaults to "nl".
 */
function resolveDiagramsConfig(config: BsoConfig): ResolvedDiagramConfig {
  const d = config.diagrams;
  return {
    krokiUrl: d?.krokiUrl ?? DEFAULT_DIAGRAM_CONFIG.krokiUrl,
    output: d?.output ?? DEFAULT_DIAGRAM_CONFIG.output,
    failOnError: d?.failOnError ?? DEFAULT_DIAGRAM_CONFIG.failOnError,
    locale: DEFAULT_DIAGRAM_CONFIG.locale,
  };
}

/**
 * Merges CLI overrides with the configuration file and resolves paths.
 * Merge strategy: CLI argument > Config_File > Default value.
 * All relative paths are resolved to absolute paths based on repoRoot.
 */
export function resolveConfig(
  config: BsoConfig,
  cliOverrides: CliOverrides,
  repoRoot: string,
): ResolvedConfig {
  // sourcesDir: CLI wins over config (config is required, so always present)
  const sourcesDir = resolve(
    repoRoot,
    cliOverrides.sources ?? config.sourcesDir,
  );

  // outputDir: CLI wins over config, default = "build/brightspace"
  const outputDir = resolve(
    repoRoot,
    cliOverrides.output ?? config.outputDir ?? "build/brightspace",
  );

  // readersDir: from config only, null if not provided
  const readersDir = config.readersDir
    ? resolve(repoRoot, config.readersDir)
    : null;

  // assetsDir: from config only, null if not provided
  const assetsDir = config.assetsDir
    ? resolve(repoRoot, config.assetsDir)
    : null;

  // customCss: from config only, null if not provided
  const customCss = config.customCss
    ? resolve(repoRoot, config.customCss)
    : null;

  // name: from config or derived from courseName
  const name = config.name ?? slugify(config.courseName);

  // docusaurusDir: from config only, null if not provided
  const docusaurusDir = config.docusaurusDir
    ? resolve(repoRoot, config.docusaurusDir)
    : null;

  // docentenHandleiding: resolves to absolute paths if present
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
    docusaurusDir,
    docentenHandleiding,
    diagrams: resolveDiagramsConfig(config),
    repoRoot,
  };
}

/**
 * Fallback resolution when no configuration file is available,
 * but a --sources CLI argument is provided.
 * Produces a minimal ResolvedConfig with default values.
 */
export function resolveFromCliOnly(
  cli: CliOverrides,
  repoRoot: string,
): ResolvedConfig {
  if (!cli.sources) {
    throw new Error(
      "No configuration file found and no --sources argument provided.",
    );
  }

  const sourcesDir = resolve(repoRoot, cli.sources);
  const outputDir = resolve(repoRoot, cli.output ?? "build/brightspace");

  return {
    sourcesDir,
    readersDir: null,
    assetsDir: null,
    outputDir,
    courseName: "Course",
    version: "0.0.0",
    customCss: null,
    name: "course",
    docusaurusDir: null,
    docentenHandleiding: null,
    diagrams: { ...DEFAULT_DIAGRAM_CONFIG },
    repoRoot,
  };
}
