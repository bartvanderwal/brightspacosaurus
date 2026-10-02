/**
 * Loads, validates and resolves Brightspacosaurus configuration files.
 *
 * This module owns `brightspacosaurus.config.json` discovery, schema validation,
 * default handling and CLI override resolution.
 *
 * @module
 */

import { resolveFlashcardsOptions } from "./flashcards.ts";
import { resolveQuizOptions } from "./quiz-config.ts";
import { resolveTeacherPage } from "./teacher-page.ts";
import { resolveDiagramsConfig } from "./diagram-config.ts";
export { resolveDiagramsConfig };
import { join, resolve } from "@std/path";
import type {
  BsoConfig,
  CliOverrides,
  ReadersModuleConfig,
  ResolvedConfig,
  ResolvedQuizConfig,
  ResolvedTeacherDashboardConfig,
  ResolvedTeacherManualConfig,
  TeacherDashboardConfig,
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
  "teacherManual": {
    "inputFiles": ["docs/handleiding.md"],
    "outputName": "docentenhandleiding.pdf"
  },
  "quiz": {
    "maxAttempts": 0
  },
  "flashcards": {
    "sectionHeadings": ["Kernbegrippen"]
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
      `Invalid JSON in configuration file ${configPath}: ${
        (e as Error).message
      }`,
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

  const allowedTopLevelFields = new Set([
    "courseName",
    "version",
    "sourcesDir",
    "readersDir",
    "readersModule",
    "readerChapterNewPage",
    "readerCoverLogo",
    "assetsDir",
    "outputDir",
    "customCss",
    "name",
    "docusaurusDir",
    "teacherManual",
    "quiz",
    "diagrams",
    "flashcards",
    "teacherPage",
    "lint",
    "teacherDashboard",
  ]);
  for (const field of Object.keys(obj)) {
    if (!allowedTopLevelFields.has(field)) {
      throw new Error(
        `Unknown configuration field '${field}'.`,
      );
    }
  }

  // Required fields
  const requiredFields = ["courseName", "version", "sourcesDir"] as const;
  for (const field of requiredFields) {
    if (
      typeof obj[field] !== "string" || (obj[field] as string).trim() === ""
    ) {
      throw new Error(
        `Required field '${field}' is missing or empty in the configuration file.`,
      );
    }
  }

  // Validate optional string fields
  const optionalStringFields = [
    "readersDir",
    "readerCoverLogo",
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

  // Validate teacherManual if it is present
  if (obj.teacherManual !== undefined) {
    if (
      typeof obj.teacherManual !== "object" ||
      obj.teacherManual === null ||
      Array.isArray(obj.teacherManual)
    ) {
      throw new Error(
        "Field 'teacherManual' must be an object.",
      );
    }

    const dh = obj.teacherManual as Record<string, unknown>;
    if (!Array.isArray(dh.inputFiles) || dh.inputFiles.length === 0) {
      throw new Error(
        "Field 'teacherManual.inputFiles' must be a non-empty array of strings.",
      );
    }
    for (const file of dh.inputFiles) {
      if (typeof file !== "string") {
        throw new Error(
          "All items in 'teacherManual.inputFiles' must be strings.",
        );
      }
    }
    if (dh.outputName !== undefined && typeof dh.outputName !== "string") {
      throw new Error(
        "Field 'teacherManual.outputName' must be a string if it is provided.",
      );
    }
    if (dh.outputDir !== undefined && typeof dh.outputDir !== "string") {
      throw new Error(
        "Field 'teacherManual.outputDir' must be a string if it is provided.",
      );
    }
  }

  resolveQuizOptions(obj.quiz);
  resolveFlashcardsOptions(obj.flashcards);
  resolveTeacherPage(obj.teacherPage);
  resolveReadersModule(obj.readersModule);
  if (obj.readerChapterNewPage !== undefined && typeof obj.readerChapterNewPage !== "boolean") {
    throw new Error("Field 'readerChapterNewPage' must be true or false.");
  }
  if (obj.lint !== undefined) {
    if (
      typeof obj.lint !== "object" || obj.lint === null ||
      Array.isArray(obj.lint)
    ) {
      throw new Error("Field 'lint' must be an object.");
    }
    const lint = obj.lint as Record<string, unknown>;
    for (const key of Object.keys(lint)) {
      if (key !== "includeDirs") {
        throw new Error(`Unknown configuration field 'lint.${key}'.`);
      }
    }
    if (
      lint.includeDirs !== undefined && (
        !Array.isArray(lint.includeDirs) || lint.includeDirs.length === 0 ||
        lint.includeDirs.some((dir) => typeof dir !== "string" || !dir.trim())
      )
    ) {
      throw new Error(
        "Field 'lint.includeDirs' must be a non-empty array of non-empty directory paths.",
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
      !DIAGRAM_OUTPUT_VALUES.includes(
        diagrams.output as typeof DIAGRAM_OUTPUT_VALUES[number],
      )
    ) {
      throw new Error(
        `Field 'diagrams.output' must be one of: ${
          DIAGRAM_OUTPUT_VALUES.join(", ")
        }.`,
      );
    }

    if (
      diagrams.failOnError !== undefined &&
      typeof diagrams.failOnError !== "boolean"
    ) {
      throw new Error(
        "Field 'diagrams.failOnError' must be a boolean if it is provided.",
      );
    }
  }

  // Validate teacherDashboard if it is present
  if (obj.teacherDashboard !== undefined) {
    if (
      typeof obj.teacherDashboard !== "object" ||
      obj.teacherDashboard === null ||
      Array.isArray(obj.teacherDashboard)
    ) {
      throw new Error(
        "Field 'teacherDashboard' must be an object.",
      );
    }

    const td = obj.teacherDashboard as Record<string, unknown>;
    const allowedTdFields = new Set([
      "gitlabUrl",
      "groupPath",
      "subgroups",
      "repos",
      "teacherUsernames",
      "requireCommentsForDone",
      "orangeThresholdPercent",
      "redThresholdPercent",
    ]);

    for (const key of Object.keys(td)) {
      if (!allowedTdFields.has(key)) {
        throw new Error(
          `Unknown configuration field 'teacherDashboard.${key}'.`,
        );
      }
    }

    // Required: groupPath
    if (typeof td.groupPath !== "string" || td.groupPath.trim() === "") {
      throw new Error(
        "Field 'teacherDashboard.groupPath' must be a non-empty string.",
      );
    }
    const trimmedGroupPath = td.groupPath.trim();
    if (trimmedGroupPath.startsWith("/") || trimmedGroupPath.endsWith("/")) {
      throw new Error(
        "Field 'teacherDashboard.groupPath' must not contain leading or trailing slashes.",
      );
    }

    // Required: subgroups
    if (!Array.isArray(td.subgroups) || td.subgroups.length === 0) {
      throw new Error(
        "Field 'teacherDashboard.subgroups' must be a non-empty array of strings.",
      );
    }
    for (const sg of td.subgroups) {
      if (typeof sg !== "string" || sg.trim() === "") {
        throw new Error(
          "All items in 'teacherDashboard.subgroups' must be non-empty strings.",
        );
      }
    }

    // Required: repos
    if (!Array.isArray(td.repos) || td.repos.length === 0) {
      throw new Error(
        "Field 'teacherDashboard.repos' must be a non-empty array of repository objects.",
      );
    }
    for (const r of td.repos) {
      if (typeof r !== "object" || r === null || Array.isArray(r)) {
        throw new Error(
          "All items in 'teacherDashboard.repos' must be objects with 'prefix' and 'label'.",
        );
      }
      const repoObj = r as Record<string, unknown>;
      if (typeof repoObj.prefix !== "string" || repoObj.prefix.trim() === "") {
        throw new Error(
          "Field 'prefix' in 'teacherDashboard.repos' must be a non-empty string.",
        );
      }
      if (typeof repoObj.label !== "string" || repoObj.label.trim() === "") {
        throw new Error(
          "Field 'label' in 'teacherDashboard.repos' must be a non-empty string.",
        );
      }
    }

    // Optional: gitlabUrl
    if (td.gitlabUrl !== undefined) {
      if (typeof td.gitlabUrl !== "string") {
        throw new Error(
          "Field 'teacherDashboard.gitlabUrl' must be a string if provided.",
        );
      }
      try {
        new URL(td.gitlabUrl);
      } catch {
        throw new Error(
          `Field 'teacherDashboard.gitlabUrl' must be a valid URL: '${td.gitlabUrl}'.`,
        );
      }
    }

    // Optional: teacherUsernames
    if (td.teacherUsernames !== undefined) {
      if (!Array.isArray(td.teacherUsernames)) {
        throw new Error(
          "Field 'teacherDashboard.teacherUsernames' must be an array of strings if provided.",
        );
      }
      for (const u of td.teacherUsernames) {
        if (typeof u !== "string") {
          throw new Error(
            "All items in 'teacherDashboard.teacherUsernames' must be strings.",
          );
        }
      }
    }

    // Optional: requireCommentsForDone
    if (
      td.requireCommentsForDone !== undefined &&
      typeof td.requireCommentsForDone !== "boolean"
    ) {
      throw new Error(
        "Field 'teacherDashboard.requireCommentsForDone' must be a boolean if provided.",
      );
    }

    // Optional: orangeThresholdPercent
    if (td.orangeThresholdPercent !== undefined) {
      if (
        typeof td.orangeThresholdPercent !== "number" ||
        Number.isNaN(td.orangeThresholdPercent) ||
        td.orangeThresholdPercent < 0 ||
        td.orangeThresholdPercent > 100
      ) {
        throw new Error(
          "Field 'teacherDashboard.orangeThresholdPercent' must be a number between 0 and 100.",
        );
      }
    }

    // Optional: redThresholdPercent
    if (td.redThresholdPercent !== undefined) {
      if (
        typeof td.redThresholdPercent !== "number" ||
        Number.isNaN(td.redThresholdPercent) ||
        td.redThresholdPercent < 0 ||
        td.redThresholdPercent > 100
      ) {
        throw new Error(
          "Field 'teacherDashboard.redThresholdPercent' must be a number between 0 and 100.",
        );
      }
    }

    // Relative threshold constraint: 0 <= orange < red <= 100
    const effOrange = td.orangeThresholdPercent !== undefined
      ? (td.orangeThresholdPercent as number)
      : 10;
    const effRed = td.redThresholdPercent !== undefined
      ? (td.redThresholdPercent as number)
      : 50;
    if (effOrange >= effRed) {
      throw new Error(
        `Field 'teacherDashboard.orangeThresholdPercent' (${effOrange}) must be strictly less than 'teacherDashboard.redThresholdPercent' (${effRed}).`,
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

const DEFAULT_QUIZ_CONFIG = resolveQuizOptions();

function resolveQuizConfig(config: BsoConfig): ResolvedQuizConfig {
  return resolveQuizOptions(config.quiz);
}

/**
 * Resolves teacher dashboard configuration with default values.
 * Returns null if the dashboard is not configured.
 */
export function resolveTeacherDashboardConfig(
  dashboard?: TeacherDashboardConfig,
): ResolvedTeacherDashboardConfig | null {
  if (!dashboard) {
    return null;
  }

  return {
    gitlabUrl: dashboard.gitlabUrl?.trim() || "https://gitlab.com",
    groupPath: dashboard.groupPath.trim(),
    subgroups: dashboard.subgroups ? dashboard.subgroups.map((s) => s.trim()) : [],
    repos: dashboard.repos
      ? dashboard.repos.map((r) => ({
        prefix: r.prefix.trim(),
        label: r.label.trim(),
      }))
      : [],
    teacherUsernames: dashboard.teacherUsernames
      ? dashboard.teacherUsernames.map((u) => u.trim())
      : [],
    requireCommentsForDone: dashboard.requireCommentsForDone ?? false,
    orangeThresholdPercent: dashboard.orangeThresholdPercent ?? 10,
    redThresholdPercent: dashboard.redThresholdPercent ?? 50,
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

  // readerCoverLogo: from config only, null if not provided
  const readerCoverLogo = config.readerCoverLogo
    ? resolve(repoRoot, config.readerCoverLogo)
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

  // teacherManual: resolves to absolute paths if present
  let teacherManual: ResolvedTeacherManualConfig | null = null;
  if (config.teacherManual) {
    const dh = config.teacherManual;
    teacherManual = {
      inputFiles: dh.inputFiles.map((f) => resolve(repoRoot, f)),
      outputName: dh.outputName ?? "docentenhandleiding.pdf",
      outputDir: resolve(
        repoRoot,
        dh.outputDir ??
          join(config.outputDir ?? "build/brightspace", "docenten"),
      ),
    };
  }

  return {
    sourcesDir,
    readersDir,
    readerCoverLogo,
    assetsDir,
    outputDir,
    courseName: config.courseName,
    version: config.version,
    customCss,
    name,
    docusaurusDir,
    teacherManual,
    quiz: resolveQuizConfig(config),
    flashcards: resolveFlashcardsOptions(config.flashcards),
    teacherPage: {
      path: resolve(sourcesDir, resolveTeacherPage(config.teacherPage)),
      explicit: config.teacherPage !== undefined,
    },
    lint: {
      includeDirs: cliOverrides.sources
        ? [sourcesDir]
        : config.lint?.includeDirs?.map((dir) => resolve(repoRoot, dir)),
    },
    diagrams: resolveDiagramsConfig(config),
    teacherDashboard: resolveTeacherDashboardConfig(config.teacherDashboard),
    readersModule: resolveReadersModule(config.readersModule),
    readerChapterNewPage: config.readerChapterNewPage ?? true,
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
    readerCoverLogo: null,
    assetsDir: null,
    outputDir,
    courseName: "Course",
    version: "0.0.0",
    customCss: null,
    name: "course",
    docusaurusDir: null,
    teacherManual: null,
    quiz: { ...DEFAULT_QUIZ_CONFIG },
    flashcards: resolveFlashcardsOptions(),
    teacherPage: {
      path: resolve(sourcesDir, resolveTeacherPage()),
      explicit: false,
    },
    diagrams: resolveDiagramsConfig({}),
    teacherDashboard: null,
    repoRoot,
  };
}

/**
 * Validates `readersModule` and fills in the default slug "readers". The slug
 * is a single folder name, so it can match a content folder in `sourcesDir`.
 */
export function resolveReadersModule(value?: unknown): ReadersModuleConfig {
  if (value === undefined) return { slug: "readers", title: null };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Field 'readersModule' must be an object with optional 'slug' and 'title'.");
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== "slug" && key !== "title") {
      throw new Error(`Unknown field 'readersModule.${key}'. Allowed: slug, title.`);
    }
  }
  if (
    obj.slug !== undefined &&
    (typeof obj.slug !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(obj.slug))
  ) {
    throw new Error(
      "Field 'readersModule.slug' must be a folder name (letters, digits, '.', '_' or '-').",
    );
  }
  if (obj.title !== undefined && (typeof obj.title !== "string" || !obj.title.trim())) {
    throw new Error("Field 'readersModule.title' must be a non-empty string.");
  }
  return {
    slug: (obj.slug as string | undefined) ?? "readers",
    title: (obj.title as string | undefined)?.trim() ?? null,
  };
}
