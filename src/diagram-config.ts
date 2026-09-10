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
  kroki: {
    krokiBase: string;
    output: "img-html-base64" | "inline-svg" | "img-base64" | "object-base64";
    target: "html";
  };
}

/**
 * Maps a resolved diagram configuration to `remark-kroki-a11y` plugin options.
 * `krokiUrl` becomes `kroki.krokiBase`, `output` becomes `kroki.output`.
 * The diagram-mode toggle is always disabled: Brightspace has no client-side
 * JavaScript to drive it.
 */
export function buildKrokiA11yOptions(cfg: ResolvedDiagramConfig): KrokiA11yOptions {
  return {
    languages: [...SUPPORTED_DIAGRAM_LANGUAGES],
    locale: cfg.locale,
    showSource: true,
    showA11yDescription: true,
    showDiagramModeToggle: false,
    kroki: {
      krokiBase: cfg.krokiUrl,
      output: cfg.output,
      target: "html",
    },
  };
}
