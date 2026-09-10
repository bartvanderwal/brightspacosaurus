# Implementation Plan: Accessible Diagram Rendering

**Branch**: `bartvanderwal-feature-spec-kit-migration` | **Date**: 2026-09-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-diagram-rendering-a11y/spec.md`

## Summary

Add build-time PlantUML and Mermaid rendering to the existing Markdown-to-HTML pipeline, reusing `remark-kroki-a11y` in-process under Deno. Map project configuration to the plugin, normalize its output through a thin Brightspace adapter that works in Brightspace's JavaScript-restricted iframe, provide deterministic ARIA relationships, and separate static validation from rendering for future lint reuse. The PDF/reader route remains unchanged.

## Technical Context

**Language/Version**: TypeScript on Deno >= 2.0

**Primary Dependencies**: `unified`, `remark-*`, `rehype-*`, `remark-kroki-a11y@^0.6.2`, Kroki-compatible rendering service

**Storage**: Markdown/config input and generated HTML files; no database

**Testing**: Deno test runner, `@std/assert`, fast-check with at least 100 runs
per property, mocked Kroki for deterministic tests, representative integration
tests against a real/local endpoint

**Target Platform**: Deno CLI on macOS/Linux/CI; generated HTML inside a
JavaScript-restricted Brightspace iframe

**Project Type**: Single-project CLI and reusable TypeScript library

**Performance Goals**: No additional network calls for unsupported code blocks;
one render request per supported diagram; deterministic repeat builds

**Constraints**: Build-time output for Brightspace's restricted iframe, actionable fail-fast errors by default, configurable fallback, JSR-compatible imports/assets, no changes to PDF output, no duplicated upstream rendering or description logic

**Scale/Scope**: PlantUML and Mermaid in lesson-page HTML; typical course-sized
source trees; five user stories and nine universal correctness properties

## Constitution Check

*GATE: Passed before research and re-checked after design.*

| Principle | Result | Evidence |
|---|---|---|
| Generic, configuration-driven | PASS | Endpoint, output, and fallback are configuration values |
| Deterministic, isolated output | PASS | Stable IDs and double-run property tests; output remains in build directory |
| Fail fast and explain remedy | PASS | Typed error categories; strict default; explicit fallback |
| Test at the right boundary | PASS | Unit, property, fixture, and real-endpoint coverage |
| Deno and JSR compatibility | PASS | In-process Deno spike passed; no direct bundled-asset reads |

Post-design check: PASS. No constitutional exceptions or unjustified complexity remain. The adapter is required because `remark-kroki-a11y`'s preview-oriented markup does not itself satisfy the Brightspace iframe restriction and ARIA contract.

## Project Structure

### Documentation (this feature)

```text
specs/001-diagram-rendering-a11y/
├── checklists/
│   └── requirements.md
├── contracts/
│   └── diagram-config.md
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── config-loader.ts
├── diagram-adapter.ts
├── diagram-config.ts
├── diagram-renderer.ts
├── diagram-validation.ts
├── markdown-converter.ts
├── mod.ts
└── types.ts

tests/
├── fixtures/
│   ├── docusaurus-preview/
│   │   └── docusaurus.config.ts
│   ├── diagram-mermaid.md
│   └── diagram-plantuml.md
├── diagram-adapter.property.test.ts
├── diagram-config.property.test.ts
├── diagram-config.test.ts
├── diagram-preview-parity.test.ts
├── diagram-renderer.integration.test.ts
├── diagram-renderer.property.test.ts
└── diagram-validation.property.test.ts

deno.json
docs/user-manual.md
```

**Structure Decision**: Extend the existing single-project module layout.
Configuration mapping, rendering, output adaptation, and static validation are
separate concerns wired through `markdown-converter.ts`. No new application or
service boundary is introduced.

## Phase 0: Research

The completed decisions are recorded in [research.md](research.md). The prior
spike established that `remark-kroki-a11y@0.6.2` works in-process under Deno,
including its CommonJS wrapper and asynchronous ESM backend. A Node subprocess
is therefore rejected.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines resolved configuration, issue/error
  categories, adaptation context, and output invariants.
- [contracts/diagram-config.md](contracts/diagram-config.md) defines the public
  JSON configuration contract and defaults.
- [quickstart.md](quickstart.md) defines runnable end-to-end validation.
- No HTTP API contract is added; the external Kroki protocol remains owned by
  the reused provider.

## Implementation Approach

1. Add the plugin and raw-HTML parsing dependencies plus network permission.
2. Extend config types, validation, defaults, and provider-option mapping.
3. Add independently callable static validation and typed rendering errors.
4. Register asynchronous diagram rendering before `remark-rehype`.
5. Adapt provider output after raw HTML parsing: preserve provider-generated
   text, remove tab-only wiring, use native disclosures, and assign stable ARIA
   identifiers.
6. Reuse the same option builder in a reference Docusaurus configuration and
   verify preview/production parity with shared fixtures.
7. Add fixtures, deterministic/property coverage, real-endpoint integration
   coverage, documentation, exports, and a minor version bump.
