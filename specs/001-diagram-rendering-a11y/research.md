# Research: Accessible Diagram Rendering

## Decision 1: Run `remark-kroki-a11y` in-process

**Decision**: Import `remark-kroki-a11y@0.6.2` through Deno's npm compatibility layer and register it directly in the existing asynchronous unified pipeline.

**Rationale**: The recorded spike on Deno 2.9.6 rendered PlantUML and Mermaid in both embedded-image and inline-SVG modes. CommonJS `require`, Node `fs`/`path`, `process.env`, and the dynamic ESM import of `remark-kroki` all worked. The result contained generated descriptions and native disclosure markup without emitting scripts.

**Alternatives considered**:

- Node subprocess: rejected because the in-process route works and avoids a second runtime, process orchestration, and serialization.
- Reimplement rendering or descriptions: rejected because it violates the single-source-of-truth requirement.

## Decision 2: Parse provider HTML before adapting it

**Decision**: Enable dangerous HTML at the remark/rehype boundary, parse it with `rehype-raw`, then perform a narrow HAST adaptation for Brightspace.

**Rationale**: `remark-kroki-a11y` emits raw HTML nodes. Parsing those nodes makes structural transformations and ARIA checks reliable without string rewriting.

**Alternatives considered**:

- Pass raw HTML directly to stringify: rejected because it prevents safe structural adaptation.
- Rebuild `remark-kroki-a11y` output: rejected because it duplicates disclosure and label behavior.

## Decision 3: Prefer provider-native no-tab output

**Decision**: First use a `remark-kroki-a11y` configuration or integration point that emits standalone native disclosures. If unavailable when both source and description are enabled, minimally transform the tab panels into two native disclosures while preserving all provider-generated labels and content.

**Rationale**: The spike showed that standalone source-only and description-only modes already emit the desired native markup. Combined mode adds tab wiring but no script. A narrow structural transform is sufficient.

**Alternatives considered**:

- Ship tab JavaScript: rejected because Brightspace restricts JavaScript.
- Generate new labels/descriptions: rejected because `remark-kroki-a11y` owns them.

## Decision 4: Use deterministic content-context IDs

**Decision**: Derive accessibility IDs from normalized source-file identity, diagram index, and role, with a stable hash where needed.

**Rationale**: `remark-kroki-a11y` indices are stable in simple cases but an explicit strategy guarantees byte-identical repeated builds and avoids collisions across topics.

**Alternatives considered**:

- Random UUIDs: rejected because output would not be deterministic.
- Process-global counters: rejected because ordering changes can leak between files and tests.

## Decision 5: Keep static validation separate

**Decision**: Put metadata and source-reference validation in `src/diagram-validation.ts`; map render-time failures separately in `src/diagram-renderer.ts`.

**Rationale**: Metadata problems can be reported without network access and the same pure function can later support `bso lint`. Diagram-language syntax still requires the rendering backend and remains a render-time error.

**Alternatives considered**:

- Validate only inside the renderer: rejected because it couples future linting to network rendering.

## Operational Findings

- Runtime rendering needs network access and access to `KROKI_BASE_URL`.
- The asynchronous plugin requires awaited `processor.process(...)`; the current
  converter already uses an async boundary.
- Supported aliases must include `plantuml`, `mermaid`, and `kroki`.
- Local Mermaid rendering needs the Kroki Mermaid companion; `kroki.io` includes it.
- Automated ARIA checks do not establish full WCAG conformance; manual
  assistive-technology verification remains required.
