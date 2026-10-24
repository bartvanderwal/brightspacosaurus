# Changelog

All notable changes to Brightspacosaurus are documented here.

## 0.32.0

### Added

- `slides.lessons.<lesson>.nest`: a glob or a list of globs, relative to the folder of the lesson. The links of the lesson that match have the generated slides of their page nested in the slide deck of the lesson, one level deep, after the section with the link and numbered under it (`2.1`, `2.2`, ...). The contents slide lists them as sub-entries. A matching link to a missing page fails the build; `bso lint` warns about a pattern that matches no link (`slides-nest-unused`) and about more than nine nested pages under one section (`slides-too-many-nested`). The demo course has an example with three pages (lesson 2.5).
- Brightspace: a lesson page that has slides gets a line of links at the top: the presentation of the lesson, each linked deck and a download link for each editable pptx, as the preview has a Slides button. The pptx of a linked deck is named like its slides topic (#146).

### Fixed

- QTI: the text after a `<details>` block in a quiz question is no longer dropped. `<summary>` becomes a bold line and the content stays; `bso lint` warns about other HTML blocks in a quiz file (`quiz-unsupported-html`) (#108).
- Quiz in the legacy heading form (`## Question N` with `- A.` options): text, a code block or a diagram under an option, or after the options, was dropped without a message. It is now an error, `quiz-option-content`, in `bso lint` and `bso build`, once per question, with the tip to use QuizDown, where content is indented under the option. Legacy quizzes that relied on the dropped content now fail the build until they are converted by hand; there is no conversion tool (#102).
- pptx: a paragraph now keeps its paragraph properties only as its first child, in the slides and in the speaker notes. A misplaced one made PowerPoint ignore the hyperlink after it in a bullet that mixes text, links, bold or code (#148).
- The guidebook no longer says that the slides shortcut is preview-only by design; the cartridge gets its own links (#146).

## 0.31.0

### Added

- `publishDir`: a folder for the files that are published on purpose. `bso pack` copies the current `.imscc` (or native package) to `<publishDir>/brightspace/`, removes older versions of it, and copies the editable pptx files to `<publishDir>/slides/`; `bso lint` warns (`publish-version-mismatch`) about a package of another version. The build output stays the temporary `outputDir` (#145).
- A section of a lesson that becomes slides, and that has only running text (no list, table, image, code or diagram), now gets no slide and no contents entry instead of a slide with only its heading; `bso lint` warns about it (`slides-section-without-content`). Sources are exempt. The rules are in the Software Guidebook, *Generated slides: what a section gives* (#141).
- Experimental: `bso pack --format brightspace`, a native Brightspace package (`<name>.v<version>.d2l.zip`) with the lead page of each module as its description (text and images of the main menu item, which a Common Cartridge import drops), the lessons and reader PDFs as topics and the course files. Quizzes are not in it yet (#21).
- A link in a lesson to a slide deck (an ordinary Markdown link to a file with `slides: true`) starts that deck as its own presentation, inserts its slides in the lesson's slides after the section with the link, and lists its title in the contents slide. In the cartridge the deck is a topic after the lesson's slides topic. `bso lint` warns (`slides-nested-deck`, `slides-deck-linked-twice`) (#144).
- `deno task publish` is an alias of `deno task release`, which checks the tag and publishes to JSR and npm.

## 0.30.0

### Added

- `bso lint` warns (`slides-empty-separator`) about a `---` in a slide deck that gives an empty slide, such as one directly before a heading that `headingDivider` already splits on; a `---` with content after it stays valid. A generated deck joined with a manual deck that has `headingDivider` no longer gets empty slides from `---` before such headings (#141).
- Slides get a fixed title position, a small footer logo (the course logo, else the BSO logo), page numbers as `4 / 10` without appendix slides, and a logo on the title slide; this applies to the default theme only (#140).
- A lesson turned into slides gets a contents slide with all its section headings, right after the title slide (not for a lesson with fewer than two sections). `bso lint` warns about such a lesson when its `##` headings have no numbers (`slides-unnumbered-headings`) when it has more than nine sections (`slides-too-many-sections`), (sources are not counted as a section) (#140).
- `bso lint` warns (`numbered-sources`) about a `Sources`, `Bronnen`, `References` or `Literatuurlijst` heading that has a number, in every lesson and reader: APA puts the reference list after the text as an unnumbered section.
- The slides page of the preview takes the favicon of the Docusaurus app (`static/img/favicon.*`), shows an "Esc" hint and an Esc button in Marp's on-screen controller; Esc steps back with the browser's history (#140).
- `{@include}` works in lessons that are turned into slides and in manual decks, one level deep: an include inside the included file is not expanded, and `bso lint` warns about it (`slides-nested-include`). Relative image paths of the included text are rewritten to the including file (#143).
- A feature page *Slides* in the demo course with user stories and screenshots (#140).
- Generated lesson slides keep `plantuml` and `mermaid` diagrams: each gets a slide of its own, drawn as SVG through the configured Kroki server (`diagrams.krokiUrl`); a diagram that cannot be drawn fails the build with the Kroki address (#140).
- In the preview, a lesson with slides shows a small "Slides · Alt+P" button in the top right corner, below the navbar. The slides open in the same tab and the browser's Back button returns to the lesson; BSO adds no exit key (ADR 022, #140).
- Manual slide decks can be exported as an editable `.pptx` (module `src/pptx/`): `slides.pptx` sets the course default (off), a deck overrides it with `pptx: true | false | auto` in its front matter. The file is linked from the slides page and packed into the `.imscc` (#115).

### Fixed

- Generated lesson slides show the code of a section (a code block on its own slide, long code continues on further slides) and the contents slide lists numbered sections as plain `1. Introduction` lines, not as a nested list with Roman numerals (#140).
- `deno task stop [port]` stops the process that listens on the preview port (3000 by default), for example a dev server that outlived its terminal; it names the process before it stops it.
- `deno task lint:antipatterns` lints the deliberately invalid antipattern course with the checkout's own BSO (expected exit 1).
- `deno task demo` is now `deno task preview`, like `bso preview`; it can write the generated files of the demo Docusaurus app again.
- The BSO user manual PDF now has a cover page (title, authors, version, last-changed date from Git and the logo), the table of contents on its own page and every chapter on a new page, like the readers. The title block at the top of `docs/user-manual.md` supplies the cover; the PDF language is English.

## 0.29.0

### Added

- Configurable course-wide Marp themes and title-slide logos, embedded in both the preview and `.imscc`; `readerCoverLogo` is the default slide logo (#114).
- `bso preview` can generate slides for lessons selected individually or course-wide with `slides.generateForPrefix`; `slides.lessons` provides per-lesson overrides and manual decks. Manual deck frontmatter uses the semantic `slides: true` marker; `marp: true` remains compatible (#109).
- `bso lint` warns (`deep-relative-path`) about a link, image or `{@include}` target with three or more `../` in a row, because such a path breaks when the file moves (#128).
- `build`, `pack` and `preview` write `navigation.json` and `docusaurus-sidebars.json` to `outputDir`, and the manifest is built from the same navigation model. A module takes its title from its lead page (`index`, `weekintro-N`, ...) (#78).
- The BSO user manual PDF gets a chapter *Features* built from the demo course's feature pages, with their collapsible "how" parts expanded.

### Changed

- The category of reader PDFs in the Docusaurus preview is titled like the Brightspace menu: `readersModule.title`, otherwise `Readers`.
- The package no longer contains a test file (`reader-pdf-converter_test.ts` moved to `tests/`).

## 0.28.0

### Changed

- **Breaking:** BSO no longer exports the `README.md` above `sourcesDir` as a page in a fixed `week-1` module. A course that relied on it moves that text into a topic folder (for example `algemeen/studentenhandleiding.md`).

### Added

- Course modules can use topic, theme or unit folder names; `bso lint` checks that each first-level `index.md` has an H1 title and warns about unused `_category_.json` files.
- Local Markdown links copy downloadable files into the `.imscc` and the preview. `bso lint` checks that downloads exist, stay inside `sourcesDir` and do not exceed 50 MiB.

## 0.27.0

### Changed

- The slides in the `.imscc` no longer contain the presenter notes (HTML comments in the deck). Marp wrote them into the slides HTML, where every student who opens the topic could read them. Set `slides.notes: true` to keep them; the local preview always shows them. This changes the output of 0.26.x (#117).

## 0.26.1

### Changed

- The default `slides.disclaimer` is `Preview` instead of the hardcoded `In ontwikkeling voor 2026/2027, periode 3`, which was wrong for any other course or period and, since 0.26.0, also ended up on every slide in the `.imscc`. A course that wants its own text, or none (`""`), sets `slides.disclaimer` as before (#113).

## 0.26.0

### Added

- `bso build` adds the Marp slides configured in `slides.lessons` to the `.imscc`: one self-contained HTML topic `Slides: <lesson title>` per lesson, right after the lesson in its module, with embedded images and the `slides.disclaimer`. Slides were preview-only before. `bso build --skip-slides` skips rendering, which needs npm (#112).
- A deck can be marked `slides: true` as well as `marp: true` (one of the two); BSO tells Marp `marp: true`. `slides: true` is the name to move to.

## 0.25.0

### Changed

- **Breaking:** reader PDFs no longer number sections automatically (`pandoc --number-sections` and `section-number-filter.lua` are gone). That produced `0.3.1 2.1 Overerven…`: a leading `0.` for readers without a `#` title and a second number next to a typed one. A reader now carries its own numbers (`## 1. Introduction`, `### 1.1 …`) and the PDF and the Docusaurus preview show them as written (#79).

### Added

- `bso lint` rule `reader-heading-numbering` (error): reader section headings need consecutive hierarchical numbers, without gaps or repeats. Appendices use letters (`Bijlage A`, `Appendix A`); `Bronnen`, `Sources`, `Literatuurlijst` and `Versiegeschiedenis` stay unnumbered. A reader opts out with `lintHeadingNumbers: false` in its frontmatter (#79).

## 0.24.1

### Fixed

- `bso lint` no longer warns about `sidebar_position` in a lesson's frontmatter: BSO uses it for the menu order. `lesson-frontmatter` now names only the keys BSO ignores (`title`, `slug`, `author`, ...) and reports a `sidebar_position` that is not a number (#106).

## 0.24.0

### Added

- Code in quiz questions, answer options, hints and explanations is styled in the QTI export, because a QTI question has no stylesheet and so everything is written as inline `style`: code blocks are syntax highlighted (Prism tokens, Palenight colors as in the Docusaurus preview, all WCAG AA) on a dark block with a border; inline code gets the grey background and border of lesson pages. Unknown or missing languages stay plain code. The generated markup changes: `<pre class="language-java" style="...">` with token spans (#103).

## 0.23.2

### Fixed

- PlantUML and Mermaid blocks in quiz questions, answer options, hints, explanations and assignment text were left as raw text in the QTI. `bso build` now renders them (Kroki and `remark-kroki-a11y`, as for lessons): the SVG is stored in `quiz/week-N/assets/`, followed by the diagram source and a natural-language description in `<details>` blocks. Each image is titled after its question (`Question 4, answer A`) unless the fence has an `imgTitle`; the preview uses the same titles. A quiz with a diagram now needs the Kroki endpoint at build time; an unreachable endpoint fails the build unless `diagrams.failOnError` is `false` (#101, #45).
- `bso lint` reports diagram authoring errors inside a `quiz` block (#101).
- The practice quiz's own texts follow `quiz.locale`: buttons, the missing-answer message, the score and the "New attempt" confirmation were always English. With `nl` they read `Controleer antwoorden`, `Nieuwe poging`, `2 / 2 punten` and so on. A course that sets neither `quiz.locale` nor `diagrams.locale` still gets English, as documented.

## 0.23.1

### Fixed

- `bso preview` writes the complete BSO stylesheet to `src/generated/brightspacosaurus.css` in the Docusaurus app (with a `.gitignore` for the generated folder). A course app loads it with `@import '../generated/brightspacosaurus.css';` in its `src/css/custom.css`, without a path to a BSO checkout or `node_modules`, and without installing BSO from npm. The package-style `/css` import described in 0.23.0 only existed in the npm package, never reached courses that load BSO from JSR, and is removed (#95).

## 0.23.0

### Added

- Voortgangsverkenner caches progress locally with per-repository timestamps, 5-minute/24-hour freshness, seven-day retention, explicit refresh/clear controls and a shared-origin privacy warning. Tokens stay in memory (#61).
- `bso build` and `deno task build` generate Brightspace HTML, QTI quizzes, PDFs and assets.

### Changed

- **Breaking:** `build` replaces `prepare` without a compatibility alias. Update CLI commands and Deno tasks; library callers use `runBuild` and `BuildOptions` instead of `runPrepare` and `PrepareOptions`.

### Fixed

- Practice quizzes ask for confirmation before "New attempt" clears answers and feedback. Cancelling preserves the current attempt.
- Demo configuration examples use copyable JSON blocks, with code-block copy buttons always visible in the Docusaurus preview.

## 0.22.0

### Added

- QuizDown question names: in heading form a number at the start of the name is the question number (`## ? 29. Generated interface` is question 29, named "Generated interface"). The preview shows `Vraag 29 — Generated interface` (the name may hold inline Markdown such as code), QTI writes the name as the item title, and a question whose name is only a number gets the warning `quizdown-question-name` (#90).
- `bso preview` (and `deno task demo`) runs `npm ci` (or `npm install` without a lockfile) first when the Docusaurus app has no `node_modules`.
- `deno task release` and `release:npm` let npm ask for the one-time password of a 2FA account (authenticator code or passkey) and accept `--otp=<code>` (#88).
- `docs/quizzosaurus-syntax.md` is part of the package, so the links in the manual and the guidebook work.
- A default permission set: `deno test -P` runs the tests with the permissions of `deno task test`.
- Preview-only Marp presentations mapped through `slides.lessons`: hidden Alt/Option+P opens the current lesson's slides, with local images, presenter notes and a configurable development disclaimer. Slides are not included in the Brightspace cartridge (#69).
- The Voortgangsverkenner can focus on a configured, date-aware course week, switch weeks manually, and refresh the selected week while retaining other weeks' data in memory.

### Changed

- Standalone questions and assignment subquestions have separate prefixes: `quiz.questionPrefix` (`Question`/`Vraag`) and the new `quiz.subquestionPrefix` (`Subquestion`/`Deelvraag`). With `locale: "nl"`, `questionPrefix` was `Deelvraag` before (#90).
- The heading form of QuizDown: the heading is the name of the question, the text under it is the prompt (without text, the name is also the prompt).
- The preview shows `Toon het juiste antwoord` and `Toon hint` with `locale: "nl"`.
- The demo course preview shows the Brightspacosaurus dinosaur as its favicon.
- `quiz.locale` defaults to `diagrams.locale`, the general language of BSO's generated labels, so a Dutch course gets `Vraag`/`Deelvraag`, `Toon het juiste antwoord` and Dutch preview labels without setting it per section. An explicit `quiz.locale` still wins; without either, quizzes stay English.

### Fixed

- `bso preview` from a checkout failed since 0.19.1: `Cannot find module 'remark-gfm'` (the Docusaurus config loads BSO's `src/*.ts`; the preview now sets `NODE_PATH` to the Docusaurus app's `node_modules`) and `remarkKrokiA11y is not a function` (the diagram plugin is found whichever way the loader shapes the import) (#91).

## 0.21.0 - 2026-10-12

### Added

- QuizDown assignments: `@ title` starts an assignment whose Markdown up to the first `?` is shared context; each `?` after it is a sub-question with its own response type and points, labelled `1a`, `1b`, ... Exported as QTI sections and grouped in the Docusaurus preview (#80).
- Points in QuizDown as `(2 pt)` or `(2)` at the end of the `?` line.
- QuizDown heading form: `## ? Question` (the heading is the question, with a free title and no required number), `## @ Assignment` with `### ?` sub-questions, and plain headings as sections. Questions end at a heading of the same or a higher level (#80).
- QuizDown explanation section: a `### Toelichting` or `### Explanation` heading one level below a question or sub-question holds Markdown (code, images) shown after the answer. Exported as a second QTI `itemfeedback`, shown in the preview after checking (#80).
- Option labels `a.` / `b)` in QuizDown options, checked against their position.
- Standalone QuizDown linter `src/quizdown-lint.ts`; `bso lint` calls it for quiz files that contain QuizDown. Rules (errors): `quiz-assignment-empty`, `quiz-points-syntax`, `quizdown-unindented-option-content`, `quizdown-mixed-formats`, `quizdown-invalid-subheading-in-question`, `quizdown-nested-question`, `quizdown-heading-title`, `quizdown-option-label`, `quizdown-duplicate-explanation`, `quizdown-explanation-empty`; warning: `quizdown-assignment-no-context`. Each rule has a fixture in `examples/demo-course-antipatterns`; demo quizzes 2.5 and 2.6 show assignments and the heading form.
- `@bartvanderwal/brightspacosaurus/quizzes-client` and `/flashcards-client` exports, with types: importing them defines `globalThis.bsoQuizzes` and `globalThis.bsoFlashcards`, so Docusaurus can call `initializeQuizzes(document)` and `initializeFlashcards(document)` without a `DOMContentLoaded` workaround. The scripts stay classic scripts in Brightspace (#86).

### Fixed

- Legacy question headings accept free text after the number, such as `## Vraag 12 (optioneel)` or `## Vraag 13 Bella`. 0.20.0 reported a lint error for it. The text is kept as the question's `title`.
- A subquestion outside an assignment in the legacy format is an error, not a warning.
- QuizDown: an indented fenced block after a blank line under an option stays part of that option, as in GFM; it was dropped without an error (#84).
- QuizDown lint issues in a fenced `quiz` block report the line in the file, not the line in the block.
- `deno lint` accepts the quiz and flashcard client scripts (`@ts-self-types`).

## 0.20.0 - 2026-10-11

### Added

- Quiz assignments in the legacy format: `## Opdracht N` (or `## Assignment N`) holds shared Markdown context, with `### Deelvraag Na` sub-questions that each have their own response type and optional points. Points are written `(2 pt)` or `(2)`. QTI export writes a section per assignment, the Docusaurus preview groups the sub-questions and reports weighted points, and teacher answer keys use the part labels (#80, #81).
- Quiz headings are English by default, with configurable locale-derived or explicit assignment and question prefixes.
- `bso lint` reports assignments without sub-questions, labels that do not ascend, invalid point spellings, and a sub-question outside an assignment. Lint issues carry a severity (`error` or `warning`).
- Quiz bias lint covers giveaway phrases ("Alleen", "Alle bovenstaande", "Geen van bovenstaande"), with configurable words, and a clean demo quiz (#68, #75).
- `deno task release` checks branch, clean tree, tag and push (ADR 018), then runs `deno publish` and `release:npm`; `--dry-run` passes through (#83).
- `deno task release:npm` (and `--dry-run`) publishes to npm in one step: login check, pack into `build/`, the fixes below, publish from the extracted folder, clean-up (#77).
- ADR 020 (QuizDown as preferred, strict quiz syntax in a Quizzosaurus package) and `docs/quizzosaurus-syntax.md`, with the proposed QuizDown assignment syntax (not implemented yet), and ADR 021 (convention over configuration and good defaults) (#82).

### Changed

- `deno task demo` now starts the Docusaurus preview (was `demo:preview`); `deno task demo:pack` builds the demo `.imscc` (was `demo`) (#83).

### Fixed

- Relative quiz images are copied into the cartridge and referenced as quiz resource dependencies.
- The npm package declares types for the `./tabs` export and no longer contains an empty `assets/brightspacosaurus-tabs.d.ts.d.ts` (#77).

## 0.19.1 - 2026-10-09

### Fixed

- Quiz QTI export renders Markdown code in questions, answer options and feedback; fenced code is preserved in legacy question prompts.
- A `quiz` block may use a four-backtick fence around three-backtick code blocks; the closing fence was read as a nested opening, so no questions were found.
- Fenced code in a QuizDown prompt or answer option keeps its indentation and blank lines.
- The Docusaurus quiz preview renders inline code and fenced code in prompts, answer options, hints and the correct answer, instead of literal backticks. Preview and QTI export now parse quiz text with the same Markdown parser (`src/quiz-markdown.ts`), so both targets show the same output.
- Mixing `[ ]` and lettered options in one question reports one error instead of three.

### Added

- Demo quiz 2.4 with single choice, multiple response, open short answer and Java/JSX code in prompts and answer options.

## Project Stability

Brightspacosaurus is still pre-1.0 software. Until a `1.0.0` release exists, the project should be treated as release-candidate quality rather than a stable LTS tool: configuration names, CLI behavior, generated package structure and public TypeScript APIs may still change between minor versions.

This changelog was introduced during the `0.8.0` release. Earlier entries were reconstructed from Git commit messages, GitHub issues and published package versions, so they summarize intent and visible behavior rather than every commit-level detail.

## 0.19.0 - 2026-10-06

### Added

- Quiz export and preview support for Quizzosaurus/QuizDown single-choice, multi-select and open short-answer syntax (#50).
- `bso lint` rules for bias in multiple-choice quizzes (#68): `quiz-length-bias`, `quiz-reverse-length-bias`, `quiz-answer-length-ratio`, `quiz-only-giveaway` and `quiz-position-bias` (warnings), and `quiz-answer-key-mismatch` (error) when `quiz-*-vragen-en-antwoorden.md` and its `*-antwoorden-docent.md` name a different correct answer. Thresholds and signal words are configurable in `lint.quizBias`. The rules replace owe-1's `scripts/check-quiz-bias.py`; they also find quizzes whose question headings have a title (`## Vraag 1 — Titel`), which the script skipped.

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

- `flashcards.sectionHeadings` now defaults to `["Core concepts"]`; set `[]` to disable automatic conversion. Existing `Core concepts` sections with term/definition lists become flashcards, and `bso lint` checks them (issue #31).
- Ignore a leading section number when matching flashcard headings, so `## 7. Kernbegrippen` matches `Kernbegrippen` (issue #31).

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
