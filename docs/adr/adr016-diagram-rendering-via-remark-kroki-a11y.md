# ADR 016 — Diagram rendering through remark-kroki-a11y

## Status

Accepted

## Context

Brightspacosaurus must render PlantUML and Mermaid diagrams in lesson pages to Brightspace HTML. Brightspace runs imported topic content in a restricted iframe environment in which custom JavaScript is not reliable as an interaction mechanism. At the same time, the diagram logic should not be rebuilt in BSO: rendering, source disclosure, natural-language description and labels already exist in `remark-kroki-a11y`.

Rendering goes through Kroki, which "provides a unified API to create diagrams from any of the following libraries", including PlantUML and Mermaid (Kroki, n.d.).

Diagrams are complex images in the sense of the W3C accessibility tutorials: "Complex images contain substantial information – more than can be conveyed in a short phrase or sentence." For those, "a two-part text alternative is required", consisting of a short description and "the long description – a textual representation of the essential information conveyed by the image" (W3C Web Accessibility Initiative, n.d.). `remark-kroki-a11y` provides this; its README states that it improves accessibility by "Providing source code", "Generating natural language descriptions" and "Keyboard navigation - Uses native <details> elements accessible via keyboard" (van der Wal, n.d.).

The feature specs are in `.kiro/specs/diagram-rendering-a11y/` and `specs/001-diagram-rendering-a11y/`.

### Criteria

- One source of truth for diagram rendering and accessibility content
- Brightspace output that works without client-side JavaScript
- The same configuration for the Docusaurus preview and the Brightspace export
- Authoring errors reported clearly, before or instead of a broken diagram

## Considered options

### Option A — Reimplement diagram rendering in BSO

**Cons:** duplicates the accessibility and description logic of `remark-kroki-a11y`.

### Option B — Render in a Node subprocess

**Cons:** an extra runtime and process boundary, while the Deno npm compatibility route works.

### Option C — JavaScript tab controls in the Brightspace output

**Cons:** Brightspace restricts custom scripts, so the tabs are not reliable.

### Option D — remark-kroki-a11y in-process with a thin Brightspace adapter (chosen)

**Pros:** reuses the plugin's rendering and accessibility content; works without JavaScript through native `<details>`/`<summary>` elements.

**Cons:** BSO depends on the plugin's public HTML contract.

## Decision

BSO registers `remark-kroki-a11y` in-process in the existing unified pipeline. The shared configuration is built in `src/diagram-config.ts`, so BSO and the Docusaurus preview can use the same provider options.

For Brightspace, BSO applies a thin adaptation to the provider output in `src/diagram-adapter.ts`: tab panels are converted to native `<details>/<summary>` disclosures, and diagrams get deterministic ARIA relationships. MDN describes this element as one that "creates a disclosure widget in which information is visible only when the widget is toggled into an open state" (MDN contributors, n.d.). BSO does not rebuild diagram descriptions or labels.

Static diagram validation lives separately in `src/diagram-validation.ts`, so a future lint route can reuse the same authoring checks without calling Kroki.

Render errors are modeled as a `DiagramError` with a category:

- `kroki-unreachable`
- `invalid-source`
- `invalid-parameter`

`diagrams.failOnError` determines whether BSO fails, or warns and keeps the original fenced code block.

## Consequences

Positive:

- `remark-kroki-a11y` remains the single source of truth for rendering and accessibility content.
- Brightspace output works without client-side JavaScript.
- Configuration, preview and production share the same option mapper.
- Authoring errors can be reported before network rendering.

Negative:

- `prepare` needs network access to Kroki, unless a fallback or a local service is used.
- Mermaid on a local Kroki requires a companion container.
- The HTML output depends on the public contracts of `remark-kroki-a11y`; BSO must keep running the adapter tests when the upstream HTML changes.

## References

- Kroki. (n.d.). *Kroki: Creates diagrams from textual descriptions*. Retrieved September 30, 2026, from https://kroki.io/
- MDN contributors. (n.d.). *<details>: The details disclosure element*. MDN Web Docs. Retrieved September 30, 2026, from https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
- van der Wal, B. (n.d.). *remark-kroki-a11y* [Computer software]. GitHub. Retrieved September 30, 2026, from https://github.com/bartvanderwal/remark-kroki-a11y
- W3C Web Accessibility Initiative. (n.d.). *Complex images*. Images tutorial. Retrieved September 30, 2026, from https://www.w3.org/WAI/tutorials/images/complex/
