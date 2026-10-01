# ADR 014 — Reader PDF conversion in Brightspacosaurus, not in a separate shell script

## Status

Accepted (May 2026)

## Context

Readers (reference material such as the Git reader, PlantUML essentials and memory models) are offered as PDFs in Brightspace. The conversion from Markdown to PDF with pandoc/xelatex has to be driven from somewhere.

There were two options:

1. A separate shell script (e.g. `scripts/build-reader-pdfs.sh`) that calls pandoc.
2. Integration into Brightspacosaurus as part of the existing `prepare` step.

The shell script already existed as a first implementation. At the same time, Brightspacosaurus is the central build pipeline for all derived assets (HTML lesson pages, QTI quizzes, the `.imscc` package). The reader PDFs are also derived assets that end up in the Brightspace package. Logic and errors around renamed pandoc flags and options, and around correctly encoding the source, can go wrong in both places, so this belongs in one place.

pandoc exposes much of that logic through options that must be kept consistent, for example `--include-in-header`: "Include contents of FILE, verbatim, at the end of the header." (MacFarlane, n.d.). BSO uses it for the shared LaTeX header.

Only the student reader PDFs go into Brightspace; the instructor readers do NOT. Even on a hidden page, a single wrong visibility toggle could expose them to students. Instructor readers are therefore kept in version control, or shared through Teams, e-mail or similar.

### Criteria

- One build command (`npm run build:brightspace` in the original course repository) must produce all derived assets
- Testability: unit tests for the conversion logic (path resolution, error handling, file naming convention)
- CI integration: the GitLab CI pipeline runs the same step as local developers
- Maintainability: manage pandoc options in one place, not in a shell script and in TypeScript

## Considered options

### Option A — Separate shell script (`build-reader-pdfs.sh`)

**Pros:**

- Simple, directly callable, no Deno knowledge needed.
- Independent of the rest of Brightspacosaurus.

**Cons:**

- A second build step that must be called and maintained separately.
- pandoc options (margins, fonts, highlight style) live in two places if Brightspacosaurus also contains pandoc-related logic.
- No unit tests: shell scripts are hard to test in isolation.
- Limited error handling (exit codes, no structured error messages).
- The CI pipeline has to configure two separate steps.

### Option B — Integration into Brightspacosaurus (chosen)

**Pros:**

- One `deno run ... prepare` command produces all derived assets (HTML, QTI, PDF).
- Unit tests for `convertReaderToPdf` (path resolution, error handling, file naming convention) run in the same test suite as the rest.
- pandoc options live in one place (`reader-pdf-converter.ts` + `reader-header.tex`).
- Structured error handling: a clear error message per reader with the file path and stderr output.
- The CI pipeline has one step; local and CI builds are identical.
- Graceful degradation: if pandoc is not installed, Brightspacosaurus shows a warning and skips the PDF step; the rest of the build continues.

**Cons:**

- Dependency on Deno for a task that could in principle be done with a shell script.
- Somewhat more code than a 10-line shell script.

## Decision

We choose option B: reader PDF conversion is part of Brightspacosaurus. The shell script `scripts/build-reader-pdfs.sh` is no longer used and can be removed.

The rationale: Brightspacosaurus is the single source of truth for all derived assets. A separate script introduces a second code path with its own pandoc options, its own error handling and its own CI configuration. That leads to divergence and duplicate maintenance.

## Consequences

Positive:

- `npm run build:brightspace` (or `deno task prepare`) produces everything: HTML, QTI, reader PDFs, `.imscc`.
- pandoc options (margins, engine, highlight style, LaTeX header) live in one place.
- Unit tests cover the conversion logic.
- The CI pipeline is simpler (one step).

Negative:

- Developers who only want to generate a reader PDF have to run the whole Brightspacosaurus prepare (or call the function directly from a Deno script).
- pandoc remains an external dependency that must be installed locally (or in CI via `apt-get`).

Related:

- ADR 008 — Brightspacosaurus runtime: Deno vs. Node.js
- ADR 010 — unified pipeline for Markdown conversion
- `src/reader-pdf-converter.ts` — implementation
- `assets/reader-header.tex` — LaTeX header for the TOC page break and image scaling

## References

- MacFarlane, J. (n.d.). *Pandoc user's guide*. Retrieved September 30, 2026, from https://pandoc.org/MANUAL.html
