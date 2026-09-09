# Brightspacosaurus Constitution

## Core Principles

### I. Generic, Configuration-Driven Builds
Brightspacosaurus MUST remain a generic course build tool. Project-specific
paths, labels, and behavior belong in `brightspacosaurus.config.json` or CLI
arguments, never in source code. Commands MUST be location-independent and use
`Deno.cwd()` as the repository root.

### II. Deterministic, Isolated Output
Repeated execution with identical input MUST produce identical output. Generated
files MUST be written under the configured build directory and never alongside
source material. Archive entries and other unordered inputs MUST be normalized
to deterministic ordering.

### III. Fail Fast and Explain the Remedy
Invalid input, missing dependencies, and build failures MUST stop the command by
default with an actionable message on `stderr`. Progress belongs on `stdout`.
Fallback behavior MUST be explicit and configuration-controlled; silent failure
and success-shaped error handling are prohibited.

### IV. Test Behavior at the Right Boundary
Behavior changes MUST have unit, property, or integration coverage appropriate
to their risk. Property tests MUST run at least 100 iterations. External-tool and
packaging boundaries MUST have representative integration coverage. The
smallest relevant checks run first; `deno task test` is the release gate.

### V. Deno and JSR Compatibility
Production code MUST target Deno 2 or newer and remain publishable through JSR.
Bundled assets MUST be loaded through `src/assets.ts` using
`import.meta.resolve()` plus `fetch()`. New assets MUST be listed in
`deno.json` under `publish.include`; direct filesystem reads based on
`import.meta.url` are prohibited.

## Engineering Constraints

- Keep the module boundaries under `src/` cohesive and expose supported library
  surfaces through `src/mod.ts`.
- Preserve the existing PDF/reader route unless a feature explicitly includes it.
- Prefer reuse of established helpers and upstream integrations over duplicated
  parsing, rendering, or validation logic.
- Follow semantic versioning in `deno.json`; feature work in the 0.x series
  requires a minor version bump in the same change.
- Publishing remains a user action unless explicitly delegated.

## Development Workflow

Specifications MUST separate user outcomes (`spec.md`), technical decisions
(`plan.md` and supporting artifacts), and executable work (`tasks.md`). Tasks
MUST reference exact paths and trace back to user stories. Code changes require
targeted tests and a final `deno task test`. Documentation changes that alter
configuration or user-visible behavior ship with the implementation.

## Governance
This constitution governs Spec Kit artifacts for this repository. `AGENTS.md`
remains the detailed operational authority; when the two differ, follow the
stricter rule and update this constitution to remove the discrepancy. Amendments
require an explicit rationale, a version change, and updates to affected
templates or active plans. Plans MUST evaluate these principles before and after
design, and justify any exception in their Complexity Tracking section.

**Version**: 1.0.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-09-09
