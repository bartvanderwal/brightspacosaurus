# Changelog

All notable changes to Brightspacosaurus are documented here.

## Project Stability

Brightspacosaurus is still pre-1.0 software. Until a `1.0.0` release exists, the project should be treated as release-candidate quality rather than a stable LTS tool: configuration names, CLI behavior, generated package structure and public TypeScript APIs may still change between minor versions.

This changelog was introduced during the `0.8.0` release. Earlier entries are reconstructed from Git commit messages, GitHub issues and published package versions. They intentionally summarize the main changes rather than claiming to be a complete historical record; for exact detail, inspect the Git history around the listed versions.

## 0.8.0 - 2026-09-13

### Added

- Render PlantUML, Mermaid and Kroki fenced code blocks in lesson HTML through `remark-kroki-a11y`.
- Add Brightspace-safe accessibility adaptation for rendered diagrams: native `<details>/<summary>` disclosures, stable ARIA links and warnings for missing diagram descriptions.
- Add `diagrams` configuration for Kroki endpoint, output mode and strict/fallback error handling.
- Add `quiz.maxAttempts` configuration and export it to QTI metadata; `0` means unlimited attempts.
- Sort Brightspace navigation entries by module/week and natural lesson/quiz code, so lessons and quizzes can appear together, for example `Les 6.1` followed by `Quiz 6.1`.
- Add reference import probes for Brightspace script behaviour and two-week menu ordering.

### Changed

- Rename `docentenHandleiding` configuration to `teacherManual`; unknown config fields now fail fast with a generic error.
- Document diagram rendering, Brightspace JavaScript assumptions, manifest navigation ordering and native Brightspace package research in the Software Guidebook and user manual.
- Exclude Markdown from `deno fmt` wrapping to preserve spec/task file formatting.

### Fixed

- Surface diagram rendering failures as actionable BSO errors or warnings instead of leaking upstream fallback output.
- Preserve deterministic manifest ordering for mixed content and quiz resources.

## 0.7.0 - 2026-09-08

### Added

- Add the first `diagrams` configuration surface (`krokiUrl`, `output`, `failOnError`) as groundwork for accessible diagram rendering.
- Add and refine the diagram-rendering-a11y specification, including implementation tasks and Deno/remark-kroki-a11y spike results.

### Changed

- Rename internal type naming from `BssConfig` to `BsoConfig` and remove remaining BSS-era naming.
- Continue cleanup toward a generic BSO package that is independent of the original OWE-1 source repository.

## 0.6.2 - 2026-09-04

### Changed

- Add AI-use disclosure and improve documentation links.
- Standardize the project abbreviation from BSS to BSO in documentation and code naming where applicable.

## 0.6.1 - 2026-09-04

### Fixed

- Document the npm publication route after finding that publishing directly from a generated `.tgz` can leave npm's package README empty.

## 0.6.0 - 2026-09-04

### Added

- Add `bso preview` for starting a Docusaurus live-preview workflow from a BSO project.
- Include user manual documentation in the published JSR package so JSR documentation links no longer 404.
- Add CLI version visibility through `--version`, `-v` and the help header in the same development window.

## 0.5.x - 2026-08-28 to 2026-09-03

### Added

- Add pre-built reader PDF passthrough and tests, allowing externally supplied PDFs to be included without pandoc conversion.
- Add a Software Guidebook and expand English README/user-manual documentation for the generic CLI.
- Add JSR/npm publication documentation and improve package metadata.

### Changed

- Translate README, user manual, CLI output and error messages to English.
- Move project-specific operating instructions into `AGENTS.md`.

### Fixed

- Decode numeric HTML entities in manifest titles to avoid double-escaped Brightspace titles.
- Fix manifest grouping when `sourcesDir` points into a deep course-material structure.
- Load bundled assets through `fetch()`/materialization for JSR compatibility instead of assuming local `file://` paths.
- Open external links in a new browser tab/window instead of inside the Brightspace content frame.

## 0.4.0 - 2026-08-19

This release was not documented at the time. Based on the surrounding Git history and published package metadata, it belonged to the first JSR-publication hardening phase after the standalone extraction. For exact detail, inspect the commits around 2026-08-19.

## 0.3.0 - 2026-08-18

### Added

- First standalone Brightspacosaurus release after extraction from the OWE-1 repository.
- Move Kiro specs and relevant ADRs into the new repository.
- Read the tool version from `deno.json` when `package.json` is absent.
- Keep the initial Common Cartridge export pipeline as the baseline for the independent BSO package.
