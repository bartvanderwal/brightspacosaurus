# Definition of Done

This Definition of Done applies to Brightspacosaurus code and documentation changes.

## General

- The change is scoped to the issue, spec task or user request it addresses.
- User-visible behavior is documented in the README, user manual, Software Guidebook or changelog when appropriate.
- Configuration changes are reflected in `brightspacosaurus.config.json` examples and validation tests.
- No course-specific paths or assumptions are introduced into generic BSO code.

## Tests and Coverage

- `deno task check` and `deno task lint` pass locally.
- `deno task test` passes locally before the change is considered done.
- Overall line coverage is at least **80%**.
- Coverage reports include line, branch and function coverage.
- Branch and function coverage are used as supporting signals: line coverage alone is not enough when conditional behavior, error handling or format variants are changed.
- New behavior has focused tests at the right boundary:
  - unit tests for parsers, validators and pure transformations;
  - integration tests for CLI/build/export behavior;
  - property-based tests for deterministic output and path/format invariants;
  - manual Brightspace import verification when the behavior depends on Brightspace itself.

## Packaging and Publishing

- `deno publish --dry-run` succeeds before a version intended for JSR publication is published.
- Version changes follow semver on the current `0.x` line: patch for fixes, minor for new behavior.
- User-facing package changes are recorded in `CHANGELOG.md`.
- The user publishes to JSR unless explicitly agreed otherwise.

## Git

- Commits are logically scoped and mention relevant GitHub issues.
- Large changes are split when doing so helps review.
- Work is not pushed directly to `main` unless the user explicitly asks for it.
