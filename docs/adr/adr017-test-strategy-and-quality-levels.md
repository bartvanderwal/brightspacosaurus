# ADR 017 — Teststrategie en kwaliteitsniveaus

## Status

Geaccepteerd

## Context

Brightspacosaurus transforms Markdown into several outputs and crosses multiple boundaries: unified parsing, HTML generation, QTI, PDF conversion, Common Cartridge packaging, Docusaurus preview and Brightspace import. A single test level cannot provide useful confidence for all of these behaviors.

New functionality also tends to affect shared rendering paths. Without a deliberate test strategy, changes can pass a narrow unit test while breaking a generated package, a preview, an accessibility fallback or a real Brightspace import.

### Criteria

- Tests must run at the boundary where a behavior is decided.
- Every new behavior must have automated regression coverage.
- The suite should preserve at least 80% overall line coverage as a quality goal, with branch and function coverage reported when coverage is measured.
- Generated output must be tested for deterministic and structural invariants.
- Brightspace-specific behavior needs an explicit manual import scenario because the real LMS is an external system.

## Overwogen opties

### Optie A — Alleen unit tests

Fast and focused, but insufficient for Markdown-to-HTML, CLI, PDF, package and Brightspace behavior.

### Optie B — Alleen end-to-end tests

Close to user behavior, but slow, brittle and difficult to diagnose. Many failures would not identify the responsible transformation.

### Optie C — Layered test pyramid (chosen)

Combine unit, property-based, integration, automated end-to-end and manual system tests. Each layer covers a different boundary and gives feedback at an appropriate cost.

## Beslissing

Use these test levels:

1. **Unit tests** for parsers, validators, link conversion, metadata and pure transformations.
2. **Property-based tests** for deterministic output, path safety, ordering and format invariants.
3. **Integration tests** for Markdown-to-HTML, Markdown-to-PDF, Markdown-to-QTI, CLI commands and package/manifest generation.
4. **Automated end-to-end tests** for complete local workflows such as demo-course source to prepared output to IMSCC inspection. Browser automation may be used for Docusaurus preview when that project is available.
5. **Manual system tests** for Brightspace import, LMS topic URLs, script policies, responsive behavior and assistive-technology checks. These cannot be fully replaced by local tests.

The durable demo-course is the manual system-test fixture: its Markdown source, `deno task demo`, fixture assertions and README checklist are versioned. Generated `.imscc` files are disposable artifacts, not the source of the test.

Every feature change updates the relevant tests and documentation. Architecture, rendering contracts and test-boundary decisions are recorded in the Software Guidebook and relevant design/specification artifacts; contributor expectations are summarized in `CONTRIBUTING.md`.

## Gevolgen

Positive:

- Fast feedback for local logic and clear diagnosis of failures.
- Regression protection across generated formats and packaging boundaries.
- Explicit evidence for behaviors that require a real Brightspace course.
- Coverage is treated as a signal of test completeness rather than a substitute for boundary-appropriate tests.

Negative:

- The full suite is slower because PDF and integration tests invoke external tools.
- Manual Brightspace tests remain necessary for LMS-specific behavior.
- Some end-to-end tests require optional tools such as pandoc or a browser runtime.

## Bronnen

- Adragna, R. (2016). *Be Your Own Teacher: How to Study with Flashcards*. The Learning Scientists. https://www.learningscientists.org/blog/2016/2/20-1
- Fowler, M. (2018). *The Practical Test Pyramid*. https://martinfowler.com/articles/practical-test-pyramid.html