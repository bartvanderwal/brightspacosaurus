import remarkKrokiA11y from "remark-kroki-a11y";
import { buildKrokiA11yOptions } from "../../../src/diagram-config.ts";
import type { ResolvedDiagramConfig } from "../../../src/types.ts";

export const previewDiagramConfig: ResolvedDiagramConfig = {
  krokiUrl: "https://kroki.io",
  output: "img-html-base64",
  failOnError: true,
  locale: "nl",
};

export function createDiagramRemarkPlugins(cfg: ResolvedDiagramConfig) {
  return [[remarkKrokiA11y, buildKrokiA11yOptions(cfg)]];
}

export default {
  presets: [
    [
      "classic",
      {
        docs: {
          remarkPlugins: createDiagramRemarkPlugins(previewDiagramConfig),
        },
      },
    ],
  ],
};
