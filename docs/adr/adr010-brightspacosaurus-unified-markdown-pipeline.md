# ADR 010 — unified (remark/rehype) for Markdown-to-HTML conversion in Brightspacosaurus

## Status

Accepted (revised May 2026)

## Context

Brightspacosaurus must convert Markdown source files to HTML that can be imported into Brightspace through a Common Cartridge package. Brightspace accepts only HTML and CSS in imported content; JavaScript is not executed. This limits the choice of conversion tools: the output must be static, self-contained HTML without runtime dependencies.

At the same time we use Docusaurus as a local preview tool (see ADR 009 in the original course repository). Docusaurus compiles Markdown with MDX: "The MDX compiler transforms Markdown files to React components" (Docusaurus, n.d.-a). Its plugin system is the unified ecosystem; the Docusaurus documentation lists as a typical use case "Using existing remark plugins or rehype plugins" (Docusaurus, n.d.-b). Dev/prod parity (parsing the same Markdown in the same way in both environments) is an explicit design principle.

### Revision May 2026

The original ADR chose unified via JSR (`jsr:@unified/...`). In practice JSR did not offer a complete unified stack: the core packages (`unified`, `remark-parse`, `remark-rehype`, `rehype-stringify`) are only available via npm, not via JSR. As a temporary solution `marked` was implemented via `npm:marked`.

This led to two problems:

1. **Parity risk**: `marked` uses a different parser than Docusaurus (remark/micromark). Subtle parsing differences are possible.
2. **Limited extensibility**: `marked` has a renderer/extension API, but no full AST plugin architecture. Rich content in quiz questions (code blocks, diagrams, nested formatting in question and answer texts) needs a plugin-based pipeline.

Because both `marked` and `unified` are loaded via `npm:`, the JSR advantage disappears for both options. The choice therefore falls back to content criteria: parity and extensibility.

### Criteria

- Brightspace does not execute JavaScript in imported content; only HTML and CSS are allowed
- Dev/prod parity: the local preview (Docusaurus) and the Brightspace export must parse the same Markdown in the same way
- Extensibility: plugins for image handling, QTI section filtering, diagram rendering (Mermaid/PlantUML), and rich content in quiz questions (code blocks, formatting in question and answer texts)
- The conversion must run in Deno; both options are available via `npm:`
- JSR offers no complete Markdown conversion pipeline

## Considered options

### Option A — Reuse the Docusaurus converter

Call `@docusaurus/mdx-loader` directly to generate HTML.

**Pros:**

- Maximum parity with the local preview.

**Cons:**

- Produces React components (JSX), not static HTML. Requires a React render pass to get HTML.
- Deeply entangled with the Docusaurus ecosystem (bundler, routing, theme system); it cannot be called on its own. Docusaurus currently uses webpack as its default bundler, with Rspack as an opt-in through "Docusaurus Faster" (stable since v3.10; Docusaurus, 2025). Vite is not part of the Docusaurus roadmap.
- Requires Node.js; does not run in Deno.
- The React output contains JavaScript that Brightspace does not execute.

### Option B — unified (remark-parse → remark-rehype → rehype-stringify) via `npm:` (chosen)

The same parsing stack that Docusaurus uses under the hood, but without the MDX/React layer.

**Pros:**

- Produces static HTML without JavaScript, directly usable in Brightspace.
- The same Markdown parser (micromark/remark) as Docusaurus; parsing behavior is identical.
- Runs in Deno via the `npm:` compatibility layer.
- Plugin architecture: extensible with transformations (adjusting image paths, filtering QTI sections, diagram rendering, rich content in quiz questions). Its README describes unified as follows: "unified is an interface for processing content with syntax trees" (Wormer, n.d.), which is what enables this extensibility.
- No runtime dependencies in the output.

**Cons:**

- Styling parity with Docusaurus must be achieved separately through CSS in the HTML output.
- Navigation and sidebar are Brightspace's responsibility through the manifest.
- Loaded via `npm:`, not via JSR; the supply chain advantages of JSR do not apply here (see ADR 008 for the broader trade-off).

### Option C — marked via `npm:`

Lightweight Markdown-to-HTML converter.

**Pros:**

- Simple, fast, few dependencies.
- Was already implemented as a temporary solution.

**Cons:**

- Different parser than Docusaurus; subtle parsing differences are possible (dev/prod parity risk).
- Limited plugin architecture; insufficient for rich content in quiz questions (code blocks, diagrams, nested formatting).
- Its speed advantage over unified is irrelevant for build-time use.
- Also loaded via `npm:`; no supply chain advantage over unified.

## Decision

We choose unified via `npm:` (option B). The parsing layer is identical to what Docusaurus uses (remark/micromark), so Markdown is interpreted the same way in the local preview and in the Brightspace export. The difference lies in the rendering layer: Docusaurus renders to React components (with JavaScript), Brightspacosaurus renders to static HTML (without JavaScript), which is exactly what Brightspace requires.

The unified plugin architecture is required for the planned extensions: diagram rendering (Mermaid/PlantUML via Kroki), QTI section filtering, and rich content in quiz questions (code blocks and formatting in question and answer texts).

### Deliberately not chosen

- The Docusaurus converter, because its output contains React/JavaScript that Brightspace does not execute, and because it does not run outside the Docusaurus ecosystem.
- marked, because of the risk of parsing differences with the local preview, limited extensibility for rich quiz content, and no supply chain advantage over unified (both via `npm:`).

### JSR availability

No JSR-native Markdown conversion pipeline comparable to unified or marked is available. The choice is therefore limited to `npm:` packages. The supply chain considerations from ADR 008 (no postinstall scripts, permission model) apply equally to `npm:` packages in Deno.

## Consequences

Positive:

- One Markdown parser for both output paths (Docusaurus and Brightspace); parsing bugs become visible in both places.
- Static HTML output without JavaScript; directly importable into Brightspace.
- The plugin architecture makes future transformations (diagram rendering, quiz integration with rich content) easy to add.

Negative:

- Visual parity between Docusaurus and Brightspace must be achieved through CSS; this is an iterative process.
- The navigation structure in Brightspace is determined by `imsmanifest.xml`, not by the converter.
- `npm:` dependencies bring supply chain risks; see ADR 008 for mitigations (version pinning, dependency cooldown).

## References

- D2L. (n.d.). *Import, export, or copy course components*. Brightspace Community. Retrieved September 30, 2026, from https://community.d2l.com/brightspace/kb/articles/16771-import-export-or-copy-course-components
- Docusaurus. (n.d.-a). *Markdown features*. Retrieved September 30, 2026, from https://docusaurus.io/docs/markdown-features
- Docusaurus. (n.d.-b). *MDX plugins*. Retrieved September 30, 2026, from https://docusaurus.io/docs/markdown-features/plugins
- Docusaurus. (2025). *Docusaurus 3.10*. Retrieved September 30, 2026, from https://docusaurus.io/blog/releases/3.10
  - On the bundler choice: "Docusaurus Faster lets you opt in for our modernized build infrastructure." and "we marked Docusaurus Faster as stable."
- Wormer, T. (n.d.). *unified* [Computer software]. GitHub. Retrieved September 30, 2026, from https://github.com/unifiedjs/unified
