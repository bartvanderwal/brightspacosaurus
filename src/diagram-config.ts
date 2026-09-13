/**
 * DiagramConfig: maps BSO's resolved diagram settings to `remark-kroki-a11y`
 * plugin options. Single source of truth for both BSO and Docusaurus preview.
 * Requirements: 3.1, 5.5, 6.1, 6.4, 11.2
 */

import type { ResolvedDiagramConfig } from "./types.ts";

/** Fenced-code languages that `remark-kroki-a11y` transforms into diagrams. */
export const SUPPORTED_DIAGRAM_LANGUAGES = ["plantuml", "mermaid", "kroki"] as const;

/** Options accepted by `remark-kroki-a11y` (subset used by BSO). */
export interface KrokiA11yOptions {
  languages: string[];
  locale: "nl" | "en";
  showSource: boolean;
  showA11yDescription: boolean;
  showDiagramModeToggle: boolean;
  showDiagramLegend: boolean;
  summaryText: string;
  a11ySummaryText: string;
  tabSourceLabel: string;
  tabA11yLabel: string;
  kroki: {
    /** Public option for remark-kroki-a11y 0.6.x; internally mapped to remark-kroki's `server`. */
    krokiBase: string;
    /** Alias for tests/preview code that reason about the underlying remark-kroki option name. */
    server: string;
    output: "img-html-base64" | "inline-svg" | "img-base64" | "object-base64";
    target: "html";
    alias: string[];
  };
}

const UI_TEXT = {
  nl: {
    summaryText: '{type} broncode voor "{title}"',
    a11ySummaryText: '"{title}" in natuurlijke taal',
    tabSourceLabel: "Bron",
    tabA11yLabel: "In natuurlijke taal",
  },
  en: {
    summaryText: '{type} source for "{title}"',
    a11ySummaryText: '"{title}" in natural language',
    tabSourceLabel: "Source",
    tabA11yLabel: "In natural language",
  },
} as const;

/**
 * Maps a resolved diagram configuration to `remark-kroki-a11y` plugin options.
 * `krokiUrl` becomes `kroki.krokiBase`, `output` becomes `kroki.output`.
 * The diagram-mode toggle is always disabled: Brightspace has no client-side
 * JavaScript to drive it.
 */
export function buildKrokiA11yOptions(cfg: ResolvedDiagramConfig): KrokiA11yOptions {
  const ui = UI_TEXT[cfg.locale];
  return {
    languages: [...SUPPORTED_DIAGRAM_LANGUAGES],
    locale: cfg.locale,
    showSource: true,
    showA11yDescription: true,
    showDiagramModeToggle: false,
    showDiagramLegend: false,
    summaryText: ui.summaryText,
    a11ySummaryText: ui.a11ySummaryText,
    tabSourceLabel: ui.tabSourceLabel,
    tabA11yLabel: ui.tabA11yLabel,
    kroki: {
      krokiBase: cfg.krokiUrl,
      server: cfg.krokiUrl,
      output: cfg.output,
      target: "html",
      alias: SUPPORTED_DIAGRAM_LANGUAGES.filter((language) => language !== "kroki"),
    },
  };
}
