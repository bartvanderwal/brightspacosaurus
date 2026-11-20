import { parse } from "@std/yaml";
import type { SlidesConfig } from "../types.ts";

export type PptxMode = "raster" | "native";
export const DEFAULT_SOURCE_NOTICE =
  "Generated from Markdown. Edit the source in its Git repository, not this PowerPoint; changes here will be lost on the next export.";

export interface PptxSettings {
  mode: PptxMode;
  origin: "deck" | "course" | "default";
  notice: string;
}

export function validatePptxSettings(
  settings: Record<string, unknown>,
  source: string,
): void {
  if (
    settings.pptxMode !== undefined && settings.pptxMode !== "raster" &&
    settings.pptxMode !== "native"
  ) {
    throw new Error(`${source}.pptxMode must be 'raster' or 'native'.`);
  }
  const notice = settings.pptxSourceNotice;
  if (
    notice !== undefined && typeof notice !== "boolean" &&
    (typeof notice !== "string" || !notice.trim())
  ) {
    throw new Error(
      `${source}.pptxSourceNotice must be a boolean or nonempty text.`,
    );
  }
}

export function resolvePptxSettings(
  markdown: string,
  config: Pick<SlidesConfig, "pptxMode" | "pptxSourceNotice">,
  source: string,
): PptxSettings {
  const yaml = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").match(
    /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/,
  )?.[1];
  let front: Record<string, unknown> = {};
  if (yaml !== undefined) {
    let value: unknown;
    try {
      value = parse(yaml);
    } catch (error) {
      throw new Error(
        `${source}: invalid frontmatter: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
    if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
      throw new Error(`${source}: frontmatter must be a mapping.`);
    }
    front = Object.fromEntries(Object.entries(value ?? {}));
  }
  validatePptxSettings(front, source);
  validatePptxSettings(config, "slides");
  const mode = front.pptxMode ?? config.pptxMode ?? "raster";
  const notice = front.pptxSourceNotice ?? config.pptxSourceNotice ?? true;
  return {
    mode: mode === "native" ? "native" : "raster",
    origin: front.pptxMode !== undefined
      ? "deck"
      : config.pptxMode !== undefined
      ? "course"
      : "default",
    notice: notice === false
      ? ""
      : typeof notice === "string"
      ? notice
      : DEFAULT_SOURCE_NOTICE,
  };
}
