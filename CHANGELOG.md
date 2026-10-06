# Changelog

All notable changes to Brightspacosaurus are documented here.

## Project Stability

Brightspacosaurus is still pre-1.0 software. Until a `1.0.0` release exists, the project should be treated as release-candidate quality rather than a stable LTS tool: configuration names, CLI behavior, generated package structure and public TypeScript APIs may still change between minor versions.

This changelog was introduced during the `0.8.0` release. Earlier entries were reconstructed from Git commit messages, GitHub issues and published package versions, so they summarize intent and visible behavior rather than every commit-level detail.

## 0.19.0 - 2026-10-06

### Added

- A GitHub Actions release workflow that publishes to JSR and npm with OIDC; npm releases include provenance (#6).

## 0.18.0 - 2026-10-05

### Added

- `bso lint` starts with the directories and file counts it scanned, colors the `error` and `warning` word on a terminal (not with `NO_COLOR`, `TERM=dumb` or a pipe) and puts a blank line before the summary.
- `bso lint` rules `lesson-frontmatter` (YAML frontmatter in a lesson file) and `hard-wrapped-lines` (paragraphs wrapped at a fixed column). Flashcard sections now also accept a `::::flashcards` set.
- `imsmanifest.xml` records the BSO version, course name and course version in the LOM description, and a build time when `SOURCE_DATE_EPOCH` is set.
- The README has a Documentation section with the role of each kind of documentation, and the demo folders explain how they differ.

### Changed

- Flashcard lists under a heading render as a compact bulleted list; `::::flashcards` sets keep the card style. The Show/Hide definitions button follows `diagrams.locale`.
- Reader PDFs fall back to TeX Gyre fonts when DejaVu is not installed.
- `examples/demo-course-with-all-lint-issues` is now `examples/demo-course-antipatterns`; the `lint:issues` and `lint:course` tasks are gone, run `bso lint` in the course folder instead.

## 0.17.0 - 2026-10-05

### Added

- `teacherDashboard.module`: put the Voortgangsverkenner in a content module, directly after the teacher page, instead of in its own "Instructor material (hide after import)" module, which is then no longer created. Same form as `readersModule` (`{ "slug": "algemeen", "title": "Algemeen" }`). Without the option nothing changes (#55).
- Reader PDFs number their chapters and sections (1, 1.1, ...). A single top-level title that repeats the cover title is dropped from the body.
- `diagrams.locale` (`nl` or `en`, default `nl`) is now a configuration field. It sets the language of the diagram labels, the reader PDF cover labels and the PDF document language.
- `bso lint` rule `metadata-fields-one-line`: warns when `_Label_: value` or `**Label:** value` fields end up in one paragraph and render on one line. `deno task lint:docs` checks the documentation.

### Changed

- In the online demo, a reader page starts with the embedded PDF; the web version follows below it.

## 0.16.0 - 2026-10-02

### Added

- Every chapter of a reader PDF starts on a new page: a Lua filter puts a page break before each heading of the chapter level (the highest heading level, or the next one when the highest occurs only once as a title). Turn it off with `readerChapterNewPage: false`. Manual `\clearpage` lines in readers are no longer needed (#53).
- Reader PDF covers show both the original date (`date`/`datum`) and the date of the last change, each on its own line. The last change comes from Git (the last commit that touched the reader), with `updated`/`bijgewerkt` from the front matter as fallback; equal dates give one line. Labels follow `diagrams.locale` (nl/en).

### Changed

- In a shallow Git clone, BSO no longer uses the Git date for readers, because it may be missing or too recent; it falls back to `updated`.

## 0.15.0 - 2026-10-01

### Added

- `readersModule` in the configuration: put the reader PDFs in a content module, for example `{ "slug": "algemeen", "title": "Algemeen" }`, after that module's pages, instead of a separate "Readers" module. The default stays a separate "Readers" module.
- The Brightspace menu respects `sidebar_position` from the front matter, as the Docusaurus sidebar does: positioned pages first, ascending.
- The teacher page always comes first in its module, in the Brightspace menu and in the Docusaurus preview.

## 0.14.2 - 2026-10-01

### Changed

- Resolve bundled asset URLs with `new URL(…, import.meta.url)` instead of a dynamic `import.meta.resolve`, so `deno publish` no longer warns about an unanalyzable `import.meta.resolve`. Behaviour is unchanged.

## 0.14.1 - 2026-10-01

### Fixed

- Export what a course's own Docusaurus preview needs for the Voortgangsverkenner tabs: `remarkTeacherDashboard` and `DASHBOARD_DIRECTIVE` from the package root and from the new `./teacher-page` export (runtime-neutral, no Deno APIs), and the tab script as `./tabs`. 0.14.0 only made them available to the demo, which loads BSO from source (#37).

## 0.14.0 - 2026-10-01

### Added

- Voortgangsverkenner (teacher progress dashboard): a page in the instructor module that shows students' progress on GitLab work items, with a tree per class, repo filters, live stoplight thresholds and links to commits, merge requests and work items (#37).
- The dashboard checks a pasted GitLab token with one light call (listing the class subgroups) and rejects it with a clear message when it is invalid, expired or lacks `Group: Read`; an accepted token can no longer be edited (#37).
- `{@bso-teacher-dashboard}` on the teacher page shows the Voortgangsverkenner in a second tab next to the page's information, at full width. The Docusaurus preview shows the same tabs and a working dashboard, served by `bso preview` (#37).
- The Voortgangsverkenner bundles its fonts instead of loading them from Google Fonts, so it makes no requests to third parties besides GitLab (#37).
- `prepare --skip-readers` skips all PDF generation with pandoc (readers, instructor manual, user manual) and still copies pre-built PDFs.
- `deno task test:fast` runs all tests except the pandoc PDF tests (under a minute instead of several); `deno task test:pdf` runs only those.

## 0.13.1 - 2026-10-01

### Fixed

- Report an unknown command explicitly instead of only printing the help text: `bso foo` now prints `Unknown command 'foo'.` and a pointer to `bso --help` on stderr and exits with code 1. A `--help` after an unknown command no longer hides the error (#36).
- Show `Kopiëren mislukt` on a code-block copy button when copying fails, instead of leaving the button unchanged (#16).

### Changed

- Move the code-block copy button script from an inline string in `markdown-converter.ts` to the asset `brightspacosaurus-copy-button.js`, like the flashcard and navigation scripts, so it can be linted and unit-tested (#16).

## 0.13.0 - 2026-09-30

### Added

- Show `coverImage` from the reader frontmatter on the PDF cover page, between author and date. A missing or unusable image gives a warning and a cover without image.
- Add `readerCoverLogo` to the configuration: a logo, such as the institution logo, at the bottom of every reader PDF cover page. A missing or unusable logo gives a warning and a cover without logo.
- Keep the Brightspace content menu in sync after clicking a link to another lesson page: exported pages look up the target topic via the Brightspace LE API with the viewer's session and let Brightspace open it. Without Brightspace, or if the lookup fails, the plain relative link still works (#41). Still needs confirmation after a real Brightspace import.

### Changed

- Name the package after the course `version` instead of the BSO version, and write it to `outputDir` (default `build/brightspace/`) instead of its parent, as the README already described. The BSO version stays visible on every page and on the teacher page (#42, revises #30).
- Correct the `--output` help text: it sets the build directory that also receives the package.

## 0.12.0 - 2026-09-30

### Added

- Add `teacherPage` (default `for-teachers.md` in `sourcesDir`): BSO replaces `{@bso-versions}` on that page with a table of the course and BSO versions, in the export and the Docusaurus preview. A missing default page is skipped; a missing configured page fails `prepare` (first slice of #38, groundwork for #37).
- Add a teacher page to the demo course.

### Changed

- `flashcards.sectionHeadings` now defaults to `["Core concepts"]`; set `[]` to disable automatic conversion. Existing `Core concepts` sections with term/definition lists become flashcards, and `bso lint` checks them (#31).
- Ignore a leading section number when matching flashcard headings, so `## 7. Kernbegrippen` matches `Kernbegrippen` (#31).

### Removed

- Stop converting a hardcoded `voor-docenten.md` next to `sourcesDir`; configure the page with `teacherPage` instead.

## 0.11.2 - 2026-09-30

### Added

- Support lightweight `- **term:** definition` flashcards in explicit containers and automatic glossary conversion under configurable `flashcards.sectionHeadings`, including Markdown definitions and shared preview/export behavior (#31).
- Warn when configured glossary headings contain anything other than complete term/definition bullet lists, and add `lint.includeDirs` for selecting recursive lint inputs (#11).
- Add a separate antipattern course with one lesson for each of the 27 lint rules, plus `lint:demo` and `lint:issues` regression tasks.
- Demonstrate and test both flashcard formats in the demo course, including the configured `Core concepts` section.

### Fixed

- Report the primary cause for malformed directive nesting and quiz answer keys; report empty quiz options specifically as `quiz-option-text`.
- Remove PDF-specific frontmatter and raw LaTeX from the user manual's Markdown, and restore the old manual path with a link to the current manual.

## 0.11.1 - 2026-09-29

### Added

- Color syntax highlighting for fenced code blocks in the Brightspace export, at build time via `rehype-prism-plus` (same Prism token classes as the Docusaurus preview, no runtime JavaScript). Unknown languages stay plain code (#28).

### Fixed

- Fix reader PDF links from lesson pages (`readers/` was duplicated and one `../` level was missing).
- Replace `$IMS-CC-FILEBASE$` lesson links, which Brightspace resolved to a 404, with relative links. They open inside the topic iframe; the Brightspace menu does not follow yet (#8).
- Never pack the `docenten/` build folder into the `.imscc`; instructor PDFs are for internal use only.
- Generate the user manual PDF with its cover logo (pandoc now runs from `docs/`).

### Changed

- Take a module's Brightspace menu title from the H1 of its `index.md`, as a Docusaurus category index does; without an index the folder name remains.

## 0.11.0 - 2026-09-25

### Added

- Add offline `bso lint` diagnostics for flashcard nesting/content, includes, diagrams and quiz validity, with file/line locations and error/warning severities (first slice of #11).
- Add `quiz.shuffleAnswers` (default false), mapped to deterministic QTI `render_choice shuffle="Yes|No"`, and an interactive Docusaurus quiz preview sharing parsing, validation and configuration (#35).

### Fixed

- Accept plain, bold and inline-code answer letters, Dutch/English answer labels and `**a)**` options; reject missing/duplicate/unreachable keys and invalid questions before QTI output (#34).
- Connect Docusaurus flashcards to the shared remark transformation, behavior asset and CSS; initialize after page transitions without duplicating controls (#31).
- Correct nested demo/manual flashcard fences: four colons outside, three per card. All eight cards belong to the interactive set.
- Keep quiz-only courses packable.
- Complete the demo Docusaurus app and correct its course paths.
- Add a repository-root demo config so `bso preview` works from the checkout, plus a `deno task demo:preview` task for the local CLI.
- Document the npm subprocess permission needed by installed preview commands.
- Fix the Docusaurus preview crashing with `Cannot find module '@std/path'`: diagram config resolution now lives in a runtime-neutral module.
- Expand `{@include: ...}` in the Docusaurus preview with the same shared module as the export, so partials no longer need to be preview pages.
- Load the `remark-kroki-a11y` tab script and CSS in the preview, so the source and natural-language diagram tabs work.
- Order the preview sidebar with the same navigation sort as the Brightspace manifest, so each quiz follows its lesson.

### Changed

- Skip `_`-prefixed files and folders when scanning sources, matching the Docusaurus convention for include-only partials.
- Demo lessons and quizzes use `week.lesson` codes (e.g. `Lesson 1.1`, `Quiz 1.1`), so each quiz sorts directly after its lesson.

### Validation

- Add browser regression tests for preview/export flashcards, no-JS fallback, client navigation and quiz scoring/shuffling.
- Brightspace import remains a manual check for native answer randomization and LMS script restrictions.

## 0.10.0 - 2026-09-21

### Added

- Add accessible interactive flashcards for compact core-concept practice using `:::flashcards` and `:::flashcard` Markdown containers.
- Keep flashcard definitions usable without JavaScript and support nested Markdown in definitions.
- Add global and per-card reveal controls with keyboard focus and `aria-expanded` state.
- Expand the demo course with a durable two-week manual regression fixture.

## 0.9.1 - 2026-09-15

### Changed

- Improve public JSR API documentation coverage by adding symbol and property docs for all exported entrypoints.
- Add explicit `deno task check` and `deno task lint` quality gates and document them in the Definition of Done.
- Clarify the Docusaurus preview feedback loop in the user manual.

## 0.9.0 - 2026-09-14

### Added

- Add a mandatory separate reader-PDF cover page before the table of contents.
- Derive reader cover metadata from Markdown frontmatter, H1 headings, the reader file's last Git commit date and BSO course/version config with deterministic fallbacks.

## 0.8.1 - 2026-09-14

### Changed

- Put module lead pages such as `weekintro-*`, `weekindex-*`, `intro`, `index` and `overview` first within their Brightspace module.
- Humanize reader PDF menu titles in the generated manifest, for example `plantuml-essentials.pdf` becomes `Reader PlantUML essentials`.

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

## 0.5.5 - 2026-09-03

### Added

- Add version output through `bso --version` and `bso -v`.
- Show the package version in `bso --help`, making installed CLI versions easier to verify.

## 0.5.4 - 2026-09-03

### Changed

- Translate the user manual and CLI-facing documentation to English.
- Expand README usage guidance for the standalone `bso` CLI.
- Add clearer references from README to the user manual and project credo.

## 0.5.3 - 2026-09-03

### Changed

- Improve package metadata, README image links and npm publication documentation.
- Prepare the package presentation for npm/JSR consumers outside the original course context.

## 0.5.2 - 2026-09-03

### Fixed

- Open external links in a new browser tab/window instead of inside the Brightspace content frame.

## 0.5.1 - 2026-09-03

### Fixed

- Load bundled assets through `fetch()`/materialization for JSR compatibility instead of assuming local `file://` paths.
- Fix the JSR runtime failure where asset loading could throw "Must be a file URL".

## 0.5.0 - 2026-08-28

### Added

- Add pre-built reader PDF passthrough and tests, allowing externally supplied PDFs to be included without pandoc conversion.
- Add a generic project guide and supporting cleanup for the standalone BSO repository.

### Fixed

- Decode numeric HTML entities in manifest titles to avoid double-escaped Brightspace titles.
- Fix manifest grouping when `sourcesDir` points into a deep course-material structure.

## 0.4.0 - 2026-08-19

### Added

- Make BSO invokable as a JSR CLI through `deno x`.
- Add public module exports through `mod.ts` and `deno.json` entry points.
- Add example configurations for OWE-1 and OOSE-DT.
- Add quiz resources as organization items in the generated manifest, so imported quizzes also appear in Brightspace navigation.

### Changed

- Remove remaining OWE-1-specific assets from the generic package.
- Continue genericizing the manifest builder, Markdown converter and CLI flow after extraction from the course repo.

## 0.3.0 - 2026-08-18

### Added

- First standalone Brightspacosaurus release after extraction from the OWE-1 repository.
- Move Kiro specs and relevant ADRs into the new repository.
- Read the tool version from `deno.json` when `package.json` is absent.
- Keep the initial Common Cartridge export pipeline as the baseline for the independent BSO package.
