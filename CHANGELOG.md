# Changelog

All notable changes to Brightspacosaurus are documented here.

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
