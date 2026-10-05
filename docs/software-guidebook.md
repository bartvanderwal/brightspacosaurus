# Brightspacosaurus — Software Guidebook

Brightspacosaurus (BSO) is a CLI build tool that converts Markdown course material in Git into an IMS Common Cartridge (`.imscc`) package for import into Brightspace.

This guidebook follows the structure of Simon Brown's [Software Guidebook](https://leanpub.com/software-architecture-for-developers) (the C4 model author). It is developer- and architect-facing documentation. For user-facing details (installation, configuration fields, the Brightspace import walkthrough), see the [README](../README.md) and the [user manual](user-manual.md) rather than duplicating them here.

---

## 1. Context

This chapter describes the world around BSO: the problem it solves, who uses it and which systems it works with. Read it first if you are new to the project.

- **1.1** The problem
- **1.2** Actors and external systems
- **1.3** System context
- **1.4** A note on "import" vs "export"
- **1.5** Diagram rendering in context
- **1.6** Voortgangsverkenner in context

### 1.1 The problem

Course authors want a single source of truth for their material. Keeping content as Markdown in Git gives them version control, review workflows, diffs, and reuse. Brightspace (the target LMS) offers none of that: its authoring surface is a WYSIWYG editor where content is re-typed by hand. Re-authoring material directly in Brightspace is error-prone, not reviewable, and drifts away from the source over time.

BSO bridges that gap. It takes the Markdown that already lives in Git and produces a Common Cartridge package that Brightspace can import — so the author edits in one place (Git) and publishes to another (Brightspace) with a repeatable build step.

### 1.2 Actors and external systems

| Actor / System                                                     | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Course author                                                      | Writes and maintains course material as Markdown in Git; runs the CLI (`prepare`, `pack`) locally or in CI; sets diagram configuration (endpoint, rendering mode). After the build, the author manually imports the resulting `.imscc` into Brightspace, choosing an **integral import** (the whole course as one package) or a **selective import** of individual components (content topics, quizzes) — a selective import can overwrite items already present in the course with the same identifier. |
| Student (all learners, including those using assistive technology) | Consumes the imported course in Brightspace, including diagrams and accessibility features. BSO does not rely on custom JavaScript for diagram controls, because Brightspace content sandboxing and content frames are security-sensitive and tenant/course dependent.                                                                                                                                                                                                                                    |
| Git / GitLab                                                       | Source of truth for all course material and diagram source blocks.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Brightspace / D2L                                                  | Target LMS; the manual import destination for the generated `.imscc`. Its import UI offers both integral and selective/overwrite import; BSO has no programmatic API into it. Content files that execute scripts may be sandboxed in a secure iframe, depending on Brightspace configuration.                                                                                                                                                                                                            |
| JSR                                                                | Distribution registry for the BSO tool itself (`@bartvanderwal/brightspacosaurus`).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| remark-kroki-a11y                                                  | Unified (remark) plugin for rendering PlantUML and Mermaid diagrams to accessible HTML with disclosure controls and natural-language descriptions.                                                                                                                                                                                                                                                                                                                                                       |
| Kroki                                                              | Diagram rendering service (default public https://kroki.io; can be self-hosted for CI/offline builds). Renders diagram source to PNG, SVG, or base64-embedded images over HTTP.                                                                                                                                                                                                                                                                                                                          |
| pandoc                                                             | External CLI tool used for PDF generation (readers, instructor manual), invoked via `--allow-run=pandoc`. Optional; skipped gracefully when absent.                                                                                                                                                                                                                                                                                                                                                      |
| Instructor | Hides the instructor module after import and opens the **Voortgangsverkenner** (teacher progress dashboard, #37) in Brightspace to follow student progress on GitLab work items. Pastes a personal read-only GitLab token into the page for each session. |
| GitLab REST API | Runtime data source for the Voortgangsverkenner only: projects per class subgroup, work items, their comments and commits. Called directly from the instructor's browser; BSO itself never calls it during `prepare` or `pack`. |

### 1.3 System context

```plantuml
@startuml
!include <C4/C4_Context>

Person(author, "Course author", "Writes and maintains course material as Markdown in Git. Runs the BSO CLI locally or in CI to produce a .imscc package, then manually imports it into Brightspace — either an integral (whole-course) import or a selective import of individual components (content, quizzes) that can overwrite existing items.")
Person(student, "Student", "All learners, including those using assistive technology such as screen readers or magnification, who consume the imported course content and diagrams in Brightspace.")

System(bso, "Brightspacosaurus CLI", "«Deno / TypeScript» Converts Markdown course material into an IMS Common Cartridge (.imscc) package: lesson HTML, QTI 1.2 quizzes, and PDF readers, from a single Git source of truth.")

System_Ext(git, "Git / GitLab", "Version-controlled source of truth for all lesson, quiz and reader Markdown, including diagram source blocks and images.")
System_Ext(kroki_plugin, "remark-kroki-a11y", "«unified/remark plugin» Renders PlantUML and Mermaid fenced blocks to accessible HTML: an accessible name, a generated textual description, and native (no-JS) source/description disclosures.")
System_Ext(kroki, "Kroki", "«HTTP service, default https://kroki.io» Stateless diagram-as-code rendering service; converts PlantUML/Mermaid source to PNG, SVG, or base64-embedded images. Self-hostable for CI or offline builds.")
System_Ext(brightspace, "Brightspace / D2L", "«LMS» Target learning management system. Its import screen supports an integral (whole-course) import and a selective import of individual components that can overwrite existing items. Script-capable content files may be sandboxed in a secure iframe depending on course/site configuration.")
System_Ext(jsr, "JSR", "«package registry» Distributes the BSO tool itself as @bartvanderwal/brightspacosaurus, for both CLI and library (npm-compatible) use.")
System_Ext(pandoc, "pandoc + xelatex", "«external CLI, optional» Converts reader and instructor-manual Markdown to print-quality PDF; skipped gracefully when not installed.")

Rel(author, git, "authors and edits course Markdown in, including diagram source and images")
Rel(author, bso, "runs `prepare` (convert) and `pack` (produce .imscc) as one-shot CLI builds, locally or in CI")
Rel(git, bso, "is read by, for lesson/quiz/reader Markdown and diagram source")
Rel(bso, kroki_plugin, "registers as a remark plugin during Markdown → HTML conversion")
Rel(kroki_plugin, kroki, "submits diagram source to, over HTTP")
Rel(kroki, kroki_plugin, "returns a rendered PNG, SVG, or base64-embedded image to")
Rel(bso, pandoc, "shells out to for PDF generation", "optional, --allow-run=pandoc")
Rel(bso, author, "delivers the generated .imscc package to")
Rel(author, brightspace, "manually imports the .imscc into — integrally (whole course) or selectively (individual components), the latter able to overwrite existing items")
Rel_D(student, brightspace, "opens course content, uses quizzes and accessible (UML or other) diagrams in")
Rel(jsr, bso, "distributes the published tool to authors and CI pipelines", "optional")

SHOW_LEGEND()
@enduml
```

> Rendered via Kroki (`https://kroki.io/plantuml/svg/...`) using the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) standard library, consistent with how BSO itself renders PlantUML/Mermaid diagrams for course content.

### 1.4 A note on "import" vs "export"

The terminology can be confusing because it depends on the vantage point:

- From the **Git / BSO** perspective, producing the `.imscc` is an **export** of the source material into a portable package.
- From the **Brightspace** perspective, the same file is **imported** into a course.

Throughout this guidebook: _export_ refers to BSO writing the package, _import_ refers to loading it into Brightspace. BSO never imports; it only exports.

### 1.5 Diagram rendering in context

As of version 0.8.0, BSO integrates **diagram rendering** as a core feature of the `prepare` command. When a lesson Markdown file contains PlantUML or Mermaid fenced blocks, BSO uses `remark-kroki-a11y` to render them to accessible HTML during the build. This happens only for **lesson content** (standard `.md` files converted to HTML topics); **quiz questions** follow a different path (see [ADR 011](adr/adr011-brightspacosaurus-rich-quiz-content.md)).

Key points:

- **Configuration**: The diagram service endpoint and output mode are set in `brightspacosaurus.config.json` (optional; documented defaults apply).
- **Accessibility**: Every diagram includes an accessible name and (when possible) a natural-language description. Disclosure controls (source, description) use native `<details>` elements that work without client-side JavaScript, because diagram accessibility must not depend on scripts inside Brightspace topic content. This is a requirement for diagram disclosure specifically, not a blanket no-JS rule for the whole page: other, unrelated progressive-enhancement scripts may be added elsewhere (e.g. a copy-to-clipboard button on code blocks) as long as they degrade gracefully when Brightspace blocks scripts.
- **Error handling**: The build can be configured to fail strictly (stop on any diagram error) or fall back gracefully (warn, retain source block, continue). See Section 6 "Software Architecture" for the error classification strategy.

### 1.6 Voortgangsverkenner in context

The Voortgangsverkenner (teacher progress dashboard, #37) is the first BSO output that talks to an external system **at runtime**. BSO only generates the page during `prepare`, with the `teacherDashboard` settings from `brightspacosaurus.config.json` embedded. Everything else happens in the instructor's browser: the page calls the GitLab REST API with a token the instructor pastes in. There is no BSO back end and no proxy.

```plantuml
@startuml
!include <C4/C4_Context>

Person(instructor, "Instructor", "Follows the progress of a class on GitLab work items, from inside the Brightspace course.")
Person(author, "Course author", "Configures teacherDashboard (GitLab URL, group, subgroups, repo prefixes, thresholds) in brightspacosaurus.config.json.")

System(bso, "Brightspacosaurus CLI", "«Deno» Generates the Voortgangsverkenner page (HTML, CSS, JS) into the instructor module of the .imscc during prepare.")
System(dashboard, "Voortgangsverkenner", "«client-side page in the instructor's browser» Lists students per class, their assignment repos, work items and linked commits, with stoplights.")
System_Ext(brightspace, "Brightspace / D2L", "«LMS» Hosts the page in the hidden instructor module after import.")
System_Ext(gitlab, "GitLab REST API", "«e.g. gitlab.aimsites.nl /api/v4» Projects, work items (issues), notes and commits of the student repos in the course group.")

Rel(author, bso, "configures and runs prepare/pack")
Rel(bso, brightspace, "page is imported into, as part of the .imscc", "manual import")
Rel(brightspace, dashboard, "serves the page to")
Rel(instructor, dashboard, "opens, pastes a read-only token into, filters and clicks through")
Rel(dashboard, gitlab, "reads projects, work items, notes and commits from", "HTTPS, PRIVATE-TOKEN header")
Rel(dashboard, gitlab, "links to commits, merge requests and work items in", "new tab")

SHOW_LEGEND()
@enduml
```

#### 1.6.1 Use case: follow class progress

| | |
|---|---|
| **Actor** | Instructor |
| **Goal** | See which students lag behind on the work items of the current assignment level, and open their concrete work. |
| **Precondition** | The course package is imported, the instructor module is hidden from students, and the instructor has a fine-grained, read-only GitLab token for the course group (see the user manual). |
| **Main flow** | 1. The instructor opens the Voortgangsverkenner in the instructor module. 2. The instructor pastes the token; the browser's password manager may fill it in. 3. The instructor chooses a class (subgroup) and the repo levels to show, for example only `n3-`. 4. The page fetches projects, work items, notes and commits and shows a stoplight per student, per repo and per work item. 5. The instructor clicks a commit, merge request or work item; it opens in GitLab in a new tab. |
| **Alternative flows** | 2a. The token lacks a permission: the page reports which repo failed and why, and shows the other repos. 3a. The instructor enables all levels to look back at earlier assignments. 4a. The instructor refreshes a single student instead of the whole class. |
| **Postcondition** | No token or student data is stored by BSO or in the course package. |

---

## 2. Functional Overview

This chapter describes what BSO does from the author's point of view: the two commands, how source files are classified and how the build is configured.

- **2.1** `prepare` — Markdown to build artifacts
- **2.2** `pack` — build directory to `.imscc`
- **2.3** File classification by prefix
- **2.4** Configuration

BSO exposes two commands (see the [README](../README.md) for full CLI usage).

### 2.1 `prepare` — Markdown to build artifacts

Scans the configured source directory and writes conversion output into the build directory (`outputDir`, default `build/brightspace`):

- Lesson Markdown → standalone HTML (`content/`)
- Quiz Markdown (prefix `quiz-`) → QTI 1.2 XML (`quiz/`)
- Reader Markdown (prefix `reader-`) → PDF via pandoc (`readers/`), if configured
- Instructor manual → composed PDF (`docenten/`), if configured
- Referenced images copied into the build directory

During lesson conversion, PlantUML and Mermaid fenced blocks are rendered by `remark-kroki-a11y` through a Kroki-compatible HTTP endpoint. The optional `diagrams` config controls the endpoint (`krokiUrl`, default `https://kroki.io`), output mode (`img-html-base64` by default), and error policy (`failOnError`, default `true`). In strict mode the build fails on invalid diagram metadata, invalid source, or unreachable Kroki. In fallback mode BSO warns, keeps the original fenced block, and continues.

### 2.2 `pack` — build directory to `.imscc`

Generates `imsmanifest.xml` from the build output and packages everything into a `.imscc` archive (a ZIP under the hood). If `prepare` has not run yet, `pack` runs it first.

### 2.3 File classification by prefix

`source-scanner.ts` classifies files by name, not by content:

| Pattern                        | Treated as                     | Destination                              |
| ------------------------------ | ------------------------------ | ---------------------------------------- |
| `quiz-*.md`                    | Quiz                           | QTI 1.2 XML                              |
| `quiz-*-antwoorden-docent.md`  | Instructor answer key          | **Excluded** (never shipped to students) |
| `reader-*.md` (top level)      | Reader                         | PDF via pandoc                           |
| `*.pdf` (top level)            | Pre-built reader               | Copied through as-is                     |
| `TODO-*.md`, `transcript-*.md` | Work-in-progress / transcripts | Excluded                                 |
| any other `*.md`               | Lesson page                    | HTML                                     |

Instructor answer keys are deliberately skipped so answers never leak into a student-facing package.

### 2.4 Configuration

All project-specific behaviour comes from `brightspacosaurus.config.json`, never from the source code. The required fields are `courseName`, `version`, and `sourcesDir`; the rest (readers, assets, output directory, custom CSS, instructor manual) are optional with sensible defaults. CLI arguments override config values. See the [README configuration section](../README.md#configuration) for the full field reference.

---

## 3. Quality Attributes

This chapter lists the quality attributes BSO is designed for and how the design supports each of them.

- **3.1** Reproducibility and determinism
- **3.2** Security by design
- **3.3** Portability
- **3.4** Maintainability
- **3.5** Accessibility by design
- **3.6** Error resilience

### 3.1 Reproducibility and determinism

Commands are idempotent: running `prepare`/`pack` repeatedly on the same input produces byte-identical output. Archive entries use deterministic file ordering (manifest entries are sorted; scanned files are sorted). This keeps `.imscc` output stable and diff-friendly across builds and CI runs.

Manifest navigation order is also deterministic and intentionally mirrors the authored lesson structure. BSO groups content and quiz entries by their first output subdirectory (for example `week-6`) and then sorts entries within that group by a natural lesson/quiz code extracted from the title or file name. When a lesson page and quiz share the same code, the lesson HTML (`webcontent`) appears before the QTI quiz item. This produces Brightspace menu sequences such as `Les 6.1` → `Quiz 6.1` → `Les 6.2` → `Quiz 6.2`, without course-specific manifest cleanup scripts. See GitHub issue #22.

### 3.2 Security by design

BSO runs on Deno, which requires explicit permission grants (`--allow-read`, `--allow-write`, `--allow-run=pandoc`, `--allow-env`). There are no automatic postinstall scripts, which removes a common supply-chain attack vector. Publishing via JSR keeps the distribution surface small. See [ADR 008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md).

### 3.3 Portability

The tool is location-independent: it uses `Deno.cwd()` as the repository root, so it works regardless of where the BSO code itself lives. It runs identically from local source (`file://`) or from the JSR cache (`https://`), and is npm-compatible through Deno's compatibility layer.

### 3.4 Maintainability

The core is a set of small, single-responsibility modules under `src/`, each doing one conversion step. Behaviour is config-driven, so adapting the tool to a new course means editing JSON, not code.

### 3.5 Accessibility by design

Brightspace topic content can support custom JavaScript, but BSO does not treat it as a dependable accessibility mechanism. D2L documents a multi-page content-topic pattern where course designers include JavaScript in HTML content topics; the same article notes that this requires an advanced course designer (D2L, n.d.-i). Separately, D2L community documentation says script-capable content may be sandboxed in a secure iframe depending on course configuration. BSO therefore keeps diagram source and natural-language descriptions available through native `<details>/<summary>` controls, independent of whether scripts run. Rendered images and inline SVGs receive deterministic ARIA relationships to the generated description where available. This is an accessibility intent and implementation constraint, not a blanket WCAG conformance claim; representative Brightspace pages still need manual assistive-technology verification.

### 3.6 Error resilience

Diagram errors are categorized as `kroki-unreachable`, `invalid-source`, or `invalid-parameter`. Static authoring issues are detected before contacting Kroki; render-time failures from `remark-kroki-a11y` are wrapped as `DiagramError`. Strict mode fails fast with source-file context. Fallback mode logs an actionable warning and keeps the original code block in the generated page so authors can still publish non-diagram content when they choose that policy.

---

## 4. Constraints

This chapter lists the fixed constraints the design has to work within: runtime, distribution, Brightspace and external tools. The table below gives each constraint and its consequence.

| Constraint                                | Detail                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime                                   | Deno ≥ 2.0 required.                                                                                                                                                                 |
| Quiz format                               | QTI **1.2** — the Brightspace Quizzes tool only supports 1.2.                                                                                                                        |
| Package format                            | IMS Common Cartridge **1.3**.                                                                                                                                                        |
| PDF toolchain                             | pandoc + xelatex/lualatex, required **only** for PDF generation (readers, instructor manual). Gracefully skipped when absent.                                                        |
| Brightspace import is additive            | Import adds modules and quizzes but never removes or deduplicates them. This is a platform constraint, not a BSO design choice. Re-importing produces duplicates; cleanup is manual. |
| No Brightspace API                        | There is no programmatic API access (yet). The import step is partly manual.                                                                                                         |
| Diagram rendering service                 | PlantUML and Mermaid rendering needs a reachable Kroki-compatible endpoint. Local Kroki requires the Mermaid companion service for Mermaid diagrams.                                 |
| Diagrams in lessons only                  | Diagram rendering is scoped to the HTML/Brightspace lesson route. Quiz questions follow the QTI route; see ADR 011.                                                                  |
| No custom JavaScript for diagram controls | Source and description controls must work as native HTML because Brightspace content sandboxing and script behavior can vary by course/site configuration.                          |

---

## 5. Principles

This chapter lists the principles that guide design decisions, from configuration to security. The list below applies to all of BSO; section 5.1 adds the principles for integrations that call an external API at runtime.

- **5.1** Security principles for runtime integrations

- **Convention over configuration.** Sensible defaults everywhere; only three fields are required. The build directory, output name, and instructor-manual location all derive from defaults unless overridden.
- **Single source of truth.** Markdown in Git is authoritative. Every artifact (HTML, QTI, PDF, manifest, `.imscc`) is generated and never hand-edited. Brightspace is a distribution channel, not the store of record.
- **Config-driven, no hardcoded paths.** Nothing project-specific lives in the code; it all comes from `brightspacosaurus.config.json` or CLI arguments.
- **Separation of tool core from course content.** The tool ships no course-specific assets. Bundled assets (default CSS, LaTeX header, Lua filters) are generic scaffolding, not content.

### 5.1 Security principles for runtime integrations

These apply to the Voortgangsverkenner and to any future page that calls an external API from Brightspace (for example GitHub instead of GitLab).

- **No secrets in the package or config.** Students can reach the HTML of hidden topics, so tokens never go into `brightspacosaurus.config.json` or the `.imscc`. The instructor pastes the token at runtime.
- **Token only in memory.** The page keeps the token in a variable while it is open; never in `localStorage`, `sessionStorage` or a cookie. All course HTML in Brightspace shares one origin, so any script in other course content could read web storage.
- **Least privilege.** A fine-grained personal access token, limited to the course group, with read permissions only for what the page calls (work items, labels, merge requests, commits, group). No `Code: Read`: the page links to commits and merge requests in GitLab instead of reading file contents. No write permissions and no member permissions.
- **Data minimisation.** The page reads only what it shows. Students are linked to repos by project name, not by reading member lists.
- **Untrusted data is text.** Titles, names, comments and commit messages from GitLab are rendered as text, never as HTML, to prevent XSS inside Brightspace.
- **No back end, no proxy.** The browser talks to GitLab directly, so the token never passes through a server we would have to secure and maintain.
- **Links to concrete work open in a new tab** with `rel="noopener"`, so GitLab pages cannot control the Brightspace page.
- **Student data only in memory too.** Fetched progress data is kept in memory and disappears when the page closes, for the same reason as the token.

---

## 6. Software Architecture

This chapter describes the architecture of BSO in C4 terms, from containers to components, and how data and configuration flow through the build.

- **6.1** Container diagram
- **6.2** Module structure
- **6.3** Component diagram
- **6.4** Data flow
- **6.5** Config resolution pipeline

### 6.1 Container diagram

BSO has a single container: the CLI process itself. There is no server, no database, and no persistent runtime — the whole system runs on one device (the author's machine or a CI runner) for the duration of one `prepare`/`pack` invocation.

```plantuml
@startuml
!include <C4/C4_Container>

Person(author, "Course author", "Runs the CLI locally or in CI.")

System_Boundary(bso, "Brightspacosaurus") {
  Container(cli, "Brightspacosaurus CLI", "Deno / TypeScript", "Single-process CLI; executes prepare and pack as one-shot builds. No persistent server component.")
}

System_Ext(git, "Git working directory", "Markdown source, on disk.")
System_Ext(pandoc, "pandoc + xelatex", "External process for PDF generation.")
System_Ext(fs, "Build directory", "Generated HTML, QTI, PDF and the .imscc archive, on disk.")
System_Ext(jsr, "JSR", "Distribution registry.")

Rel(author, cli, "invokes", "deno task prepare / pack")
Rel(cli, git, "reads", "Markdown, images")
Rel(cli, pandoc, "shells out to", "--allow-run=pandoc")
Rel(cli, fs, "writes", "build output, .imscc")
Rel(jsr, cli, "distributes")

SHOW_LEGEND()
@enduml
```

### 6.2 Module structure

The core lives under `src/`, split by conversion responsibility:

| Module                    | Responsibility                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                 | CLI entry point (`prepare`, `pack`), guarded by `import.meta.main`.                                                 |
| `config-loader.ts`        | Load, validate and resolve `brightspacosaurus.config.json`.                                                         |
| `source-scanner.ts`       | Scan source directories, classify files by prefix.                                                                  |
| `markdown-converter.ts`   | Markdown → HTML (unified / remark / rehype).                                                                        |
| `diagram-config.ts`       | Resolve BSO diagram settings into shared `remark-kroki-a11y` options for BSO and preview parity.                    |
| `diagram-renderer.ts`     | Register `remark-kroki-a11y`, normalize diagram metadata, classify render errors, and apply strict/fallback policy. |
| `diagram-adapter.ts`      | Adapt generated diagram HTML to Brightspace-safe native disclosures and deterministic ARIA relationships.           |
| `diagram-validation.ts`   | Detect static diagram authoring issues without rendering, reusable by future linting.                               |
| `quiz-converter.ts`       | Quiz Markdown → QTI 1.2 XML.                                                                                        |
| `reader-pdf-converter.ts` | Reader Markdown → PDF via pandoc.                                                                                   |
| `manifest-builder.ts`     | Generate `imsmanifest.xml` and sort Brightspace navigation entries by module/week and natural lesson/quiz code.      |
| `packer.ts`               | Pack the build directory into a `.imscc` archive.                                                                   |
| `assets.ts`               | Load bundled assets (CSS, LaTeX, Lua) in a JSR-safe way.                                                            |
| `types.ts`                | Shared TypeScript interfaces.                                                                                       |
| `mod.ts`                  | Barrel export for library use via JSR.                                                                              |

### 6.3 Component diagram

Components inside the single `Brightspacosaurus CLI` container:

```plantuml
@startuml
!include <C4/C4_Component>

Container_Boundary(cli, "Brightspacosaurus CLI") {
  Component(main, "main.ts", "«CLI entry point» Deno", "Parses the `prepare`/`pack` subcommands and flags, guarded by import.meta.main; orchestrates the pipeline and reports progress to stdout, errors to stderr, with a matching exit code.")
  Component(cfg, "config-loader.ts", "«loader» TypeScript module", "Finds, parses and validates brightspacosaurus.config.json, then resolves it into a single ResolvedConfig by merging CLI argument > config file > documented default.")
  Component(scan, "source-scanner.ts", "«classifier» TypeScript module", "Walks the configured source directory and classifies every file by its name prefix (lesson, quiz, reader, instructor answer key, work-in-progress) so the matching converter runs for each.")
  Component(md, "markdown-converter.ts", "«unified pipeline» remark / rehype", "Converts lesson Markdown into standalone HTML topics (GFM, frontmatter support) and copies referenced images into the build output.")
  Component(diagramCfg, "diagram-config.ts", "«mapper» TypeScript module", "Maps resolved diagram config to shared remark-kroki-a11y options: endpoint, output mode, labels, aliases, and no-JS settings.")
  Component(diagramRenderer, "diagram-renderer.ts", "«remark integration» TypeScript module", "Normalizes diagram metadata, registers remark-kroki-a11y, and classifies strict/fallback rendering errors.")
  Component(diagramAdapter, "diagram-adapter.ts", "«rehype adapter» TypeScript module", "Converts provider output into Brightspace-safe native disclosures with deterministic ARIA IDs.")
  Component(diagramValidation, "diagram-validation.ts", "«validator» TypeScript module", "Detects static diagram authoring issues before rendering; reusable by a future lint command.")
  Component(quiz, "quiz-converter.ts", "«converter» TypeScript module", "Converts quiz Markdown (prefix quiz-) into QTI 1.2 XML questions that Brightspace's Quizzes tool can import, including rich content in question and answer text.")
  Component(reader, "reader-pdf-converter.ts", "«converter» pandoc + xelatex", "Converts reader Markdown into print-quality PDF using a custom LaTeX header and Lua filters; skipped gracefully when pandoc is not installed.")
  Component(manifest, "manifest-builder.ts", "«generator» TypeScript module", "Builds imsmanifest.xml from the converted HTML, QTI and PDF output in deterministic, sorted order, keeping the manifest diff-friendly across builds.")
  Component(packer, "packer.ts", "«archiver» ZIP", "Packs the build directory into a .imscc archive with deterministic file ordering, ready for the author to import into Brightspace.")
  Component(assets, "assets.ts", "«JSR-safe loader» fetch + import.meta.resolve", "Loads bundled assets (default CSS, LaTeX header, Lua filters), working identically from local source (file://) and from the JSR cache (https://).")
  Component(mod, "mod.ts", "«library barrel» JSR export", "Re-exports the public API (config, scanner, converters, manifest, packer) so BSO can be consumed as a library from JSR, not only as a CLI.")
}

Rel(main, cfg, "resolves the active configuration via")
Rel(main, scan, "scans and classifies source files via")
Rel(scan, md, "hands lesson files to")
Rel(md, diagramValidation, "validates diagram metadata with")
Rel(md, diagramRenderer, "renders PlantUML/Mermaid through")
Rel(diagramRenderer, diagramCfg, "uses shared provider options from")
Rel(diagramRenderer, kroki_plugin, "registers")
Rel(kroki_plugin, kroki, "calls over HTTP")
Rel(md, diagramAdapter, "adapts rendered HTML through")
Rel(scan, quiz, "hands quiz files to")
Rel(scan, reader, "hands reader files to")
Rel(md, manifest, "contributes HTML topic entries to")
Rel(quiz, manifest, "contributes QTI question entries to")
Rel(reader, manifest, "contributes PDF reader entries to")
Rel(manifest, packer, "hands the manifest and build directory to")
Rel(assets, md, "supplies default CSS to")
Rel(assets, reader, "supplies the LaTeX header and Lua filters to")
Rel(mod, cfg, "re-exports for library consumers")
Rel(mod, scan, "re-exports for library consumers")
Rel(mod, md, "re-exports for library consumers")
Rel(mod, quiz, "re-exports for library consumers")
Rel(mod, reader, "re-exports for library consumers")
Rel(mod, manifest, "re-exports for library consumers")
Rel(mod, packer, "re-exports for library consumers")

SHOW_LEGEND()
@enduml
```

### 6.4 Data flow

**`prepare`:** resolve config → scan sources → for each classified file run the matching converter (HTML / QTI / PDF) into the build directory → copy referenced images.

**Diagram path inside lesson HTML:** Markdown source → static diagram validation → metadata normalization (`imgType`, `imgTitle`) → `remark-kroki-a11y` → Kroki HTTP render → accessible provider HTML → Brightspace adapter → final standalone HTML topic.

**`pack`:** ensure `prepare` output exists (run it if not) → scan build output for HTML, QTI and reader PDFs → sort manifest entries by module/week and natural lesson/quiz code → write `imsmanifest.xml` → ZIP the build directory into `<name>.v<version>.imscc`.

### 6.5 Config resolution pipeline

Config loading is a four-step pipeline in `config-loader.ts`:

```
findConfigFile  →  loadConfig  →  validateConfig  →  resolveConfig
```

1. **`findConfigFile`** — locate `brightspacosaurus.config.json` (explicit `--config` path or default in the working directory). Returns `null` if none is found.
2. **`loadConfig`** — read and JSON-parse the file, failing fast with a clear message on invalid JSON.
3. **`validateConfig`** — enforce the schema: required fields present and non-empty, optional fields of the correct type, `teacherManual` well-formed.
4. **`resolveConfig`** — merge with CLI overrides using the precedence **CLI argument > config file > default**, and resolve every relative path against the repo root. The output is a `ResolvedConfig` with absolute paths.

When no config file exists but `--sources` is given, `resolveFromCliOnly` produces a minimal `ResolvedConfig` with defaults.

---

## 7. Code

This chapter describes code-level conventions and solutions that are not visible in the architecture diagrams but matter when you change the code.

- **7.1** Conventions
- **7.2** Asset loading (JSR-safe)
- **7.3** Path handling
- **7.4** HTML entity handling
- **7.5** Diagram rendering and error classification
- **7.6** Syntax highlighting
- **7.7** Docusaurus integration of the Voortgangsverkenner

Each section names where the code lives and what it does, then lists the rules to keep in mind when you change it.

### 7.1 Conventions

- **Idempotent commands** — repeated runs on identical input yield identical output. `prepare` clears its output subdirectories before regenerating.
- **stderr / stdout discipline** — progress goes to `stdout`; errors and warnings go to `stderr`.
- **Exit codes** — `0` success; `1` general/config error; `2` source directory not found; `3` path escapes the repo root, or reader PDF conversion failed. Errors carry an optional `exitCode` that `main.ts` honours.

### 7.2 Asset loading (JSR-safe)

Bundled assets in `assets/` are **never** loaded with `import.meta.url` + `Deno.readTextFile()`. That works locally (`file://`) but fails from the JSR cache with _"Must be a file URL"_, because JSR serves modules over `https://`.

`src/assets.ts` provides the safe alternative:

- **`loadAssetText(name)`** — resolves the asset URL with `import.meta.resolve()` and loads it with `fetch()`. `fetch` works uniformly across `file://`, `https://` and `jsr:`. Results are cached per process.
- **`materializeAsset(name)`** — writes an asset to a temporary file (preserving its extension) and returns the path. External tools such as pandoc need a real file on disk (`--include-in-header`, `--lua-filter`) and cannot read a URL.

Every new asset must also be added to `publish.include` in `deno.json`, otherwise it is missing from the JSR package.

### 7.3 Path handling

- **Where:** `convertMarkdown` in `markdown-converter.ts`.
- **What:** it takes a `baseDir` option. Passing `sourcesDir` as the base flattens deep source directory structures.
- **Why:** manifest grouping then uses the correct subdirectory (for example `week-1`) rather than the full nested path from the repo root.

### 7.4 HTML entity handling

- **Where:** title extraction in `main.ts`, escaping in `manifest-builder.ts`.
- **Problem:** page titles for the manifest come from the generated HTML (`<h1>`), which rehype has already escaped (`&amp;`, `&#x26;`, ...). `manifest-builder.ts` escapes again when writing XML.
- **Solution:** titles are first decoded with `decodeHtmlEntities`, which handles named and numeric (hex and decimal) entities. This prevents double escaping, such as `&amp;` becoming `&amp;amp;`.

### 7.5 Diagram rendering and error classification

Diagram rendering is split over four modules. Each has one job:

| Module | Runs | Responsibility |
|---|---|---|
| `diagram-renderer.ts` | Before Markdown becomes HTML (remark) | Walks mdast code blocks and adds missing diagram metadata: `imgType` follows the fence language, `imgTitle` comes from the nearest preceding heading (fallback: a stable positional title). Registers `remark-kroki-a11y` with options from `diagram-config.ts`. |
| `diagram-adapter.ts` | After `rehype-raw` has parsed the provider HTML | Keeps the provider-generated source and natural-language descriptions and converts tabbed source/description panels to native disclosures for Brightspace. Assigns deterministic IDs such as `bso-diagram-1-description`. |
| `diagram-validation.ts` | Before any Kroki request, offline | Detects authoring issues: unsupported diagram declarations, unknown fence options, non-local `src=`, empty diagram blocks, inconsistent option values. |
| `diagram-config.ts` | At config resolution | Resolves the `diagrams` settings and their defaults. |

Accessibility details of the adapter output:

- Image diagrams use `aria-describedby`.
- Inline SVGs get `role="img"`, a stable `<title>`, `aria-labelledby`, and `aria-describedby` when a description exists.

Error classification:

- Rendering failures are wrapped in `DiagramError` with category `kroki-unreachable`, `invalid-source` or `invalid-parameter`.
- The resolved `diagrams.failOnError` setting decides whether such an error fails the build or becomes a warning plus an original-code fallback.

### 7.6 Syntax highlighting

- **What:** the HTML export highlights fenced code blocks at build time with `rehype-prism-plus` (issue #28).
- **Parity:** it emits the same Prism token classes (`token keyword`, `token comment`, ...) as the Docusaurus preview, so visual parity only needs CSS and Brightspace pages need no runtime JavaScript.
- **Unknown languages:** languages Prism does not know stay plain code (`ignoreMissing`).
- **Colors:** the token colors in `assets/brightspacosaurus.css` are scoped to `.brightspace-content` and follow the hues of the Docusaurus GitHub theme, darkened for readability on the grey code background.

Watch out: this relies on Docusaurus currently using Prism, and BSO imports nothing from Docusaurus. If Docusaurus switches highlighter (for example to Shiki), re-evaluate whether BSO follows for parity or deliberately stays on Prism.

### 7.7 Docusaurus integration of the Voortgangsverkenner

The Voortgangsverkenner (see [1.6](#16-voortgangsverkenner-in-context)) appears in the Docusaurus preview as a tab on the teacher page, with the same working dashboard as in Brightspace (dev/prod parity).

#### How the files reach Docusaurus

- `bso preview` (`runPreview` in `main.ts`) writes the dashboard files to `preview-static/` next to the build directory.
- It passes that directory to Docusaurus in the environment variable `BSO_PREVIEW_STATIC_DIR`.
- Reader PDFs from an earlier `prepare` are copied to the same directory, so reader pages can embed them (#54).

#### What a course with its own Docusaurus configuration needs

| Addition | Detail |
|---|---|
| Remark plugin | `remarkTeacherDashboard` from `@bartvanderwal/brightspacosaurus/teacher-page`, for the teacher page only, with `src: "/docenten/voortgangsverkenner.html"`. |
| Static directory | A directory that contains `docenten/voortgangsverkenner.html`: `BSO_PREVIEW_STATIC_DIR` when you start the preview with `bso preview`, or the `content` directory of a previous `prepare` (for example `build/brightspace/content`). |
| Client module | A module that imports `@bartvanderwal/brightspacosaurus/tabs` and calls `globalThis.bsoTabs?.initializeTabs(document)` in `onRouteDidUpdate`. |

A course that loads BSO via the package, for example `npm:@jsr/bartvanderwal__brightspacosaurus`, adds these itself.

#### Reference setup and fallback

- `demo-course-docs/docusaurus.config.js` shows the same setup, loading BSO from source instead of from the package.
- Without a dashboard URL, the `{@bso-teacher-dashboard}` directive renders a short note instead of the tab.

---

## 8. Design Decisions

This chapter summarises the main design decisions and links to the full Architecture Decision Records (ADRs). Section 8.1 explains the most pervasive one: the preview must show the same output as Brightspace.

- **8.1** Preview/output parity
- **8.2** Deno over Node.js
- **8.3** unified (remark / rehype) for Markdown → HTML
- **8.4** Rich content in quiz questions
- **8.5** Reader PDF conversion via pandoc
- **8.6** Publication via JSR
- **8.7** Asset loading via fetch + materialize for JSR compatibility
- **8.8** Diagram rendering via remark-kroki-a11y
- **8.9** Convention over configuration, with a config file for overrides

### 8.1 Preview/output parity

The Docusaurus preview and the Brightspace/IMSCC export are two render targets for the same Markdown source. Every author-visible feature — lessons, quizzes, links, includes, diagrams, flashcards and accessibility behavior — should work in both Docusaurus and Brightspace and remain usable and visually coherent after Brightspace import.

The preferred way to achieve this is code reuse: share parsers, renderers, assets, semantic HTML contracts and browser behavior wherever the two targets allow it. Do not create parallel implementations when a shared implementation is possible. Some target-specific work remains unavoidable because Docusaurus and Brightspace have different rendering, sandboxing and import behavior; therefore parity always requires some tests in both targets, plus a real Brightspace import test for LMS-specific behavior. But this should be minimized through code reuse (same JS in Docusaurus as in Brightspace, use Docusaurus plugins and standards when possible for new features wanted in Brigthspace).

The flashcard contract is implemented in `src/flashcards.ts` (`remarkFlashcards`).
It emits semantic `hName`/`hProperties` elements, which both remark-rehype and
Docusaurus/MDX support; raw HTML injection would not reliably survive MDX.
`assets/brightspacosaurus-flashcards.js` is the single interaction implementation:
classic inline script in exported HTML, imported initializer in Docusaurus. The
initializer is idempotent and runs after each preview route mounts. Both targets
load `assets/brightspacosaurus.css`. Definitions are initially visible for no-JS
use, and browser tests exercise both the generated export and actual Docusaurus
build, including keyboard input and client navigation. Nested directive fences
must be longer outside than inside (`::::flashcards` around `:::flashcard`).

The same transformer also accepts unordered `term: definition` lists, either in
an explicit `flashcards` container or under a heading listed in
`flashcards.sectionHeadings`. `resolveFlashcardsOptions` validates the shared
options and defaults to `DEFAULT_SECTION_HEADINGS` (`["Core concepts"]`); an
explicit `[]` disables heading recognition. `normalizeSectionHeading` is the
single comparison key for the transformer and the linter: trimmed, lowercase and
without a leading section number (`7.`, `2.3`), because course material often
numbers its sections. The CLI passes resolved options
to both HTML conversions and to Docusaurus via `BSO_PREVIEW_FLASHCARDS_CONFIG`;
the demo reads its course config when invoked directly. Custom preview apps must
pass these options to `remarkFlashcards` as well.

Heading scope follows Markdown depth until the next same/higher-level heading.
A list converts atomically only if every item has a term and definition; ordered
and task lists stay unchanged. Splitting the inline syntax tree at the first
visible colon preserves definition formatting and subsequent blocks, while terms
are rendered as escaped text. All syntaxes produce the existing card classes and
use the existing browser initializer. Property tests exercise deterministic
conversion, and browser tests compare both demo sets in preview and export.

`assets/brightspacosaurus-navigation.js` (#41) is inlined into every exported
page. Relative lesson links stay the portable fallback (#8); the script only
changes a plain same-origin click on another `.html` page when the parent window
is a Brightspace viewer (`/d2l/le/content/{ou}/…` or `/d2l/le/lessons/{ou}/…`).
It then reads the course table of contents through the documented LE API
(`/d2l/api/versions/le`, then `/d2l/api/le/{version}/{ou}/content/toc`) with the
viewer's session and optional `X-Csrf-Token`, matches the topic `Url` against the
link path and navigates the top window to the topic viewer. The API was chosen
over scraping the menu DOM, which Brightspace does not document. Any failure or a
4-second timeout falls back to the plain link. Pure helpers are exposed as
`bsoTopicNavigation` for Deno unit tests; `demo-course-docs/tests/navigation.spec.cjs`
exercises the real export inside a mocked Brightspace shell.

Reader cover images: `deriveReaderPdfMetadata` reads `coverImage`;
`convertReaderToPdf` resolves it against the reader directory and writes a
one-line header defining `\bsocoverimage` next to the PDF output, included before
`assets/reader-header.tex` and removed after pandoc. The title page in that
header shows the image only `\ifdefined\bsocoverimage`. Paths outside
`[A-Za-z0-9._/:-]` are rejected with a warning instead of being escaped, because
LaTeX path escaping is fragile across engines.

`src/teacher-page.ts` is likewise runtime-neutral. `resolveTeacherPage`
validates `teacherPage` (a relative `.md` path inside `sourcesDir`, default
`for-teachers.md`); `resolveConfig` records whether it was explicit, because only
a missing explicit page fails `prepare`. `convertMarkdown` receives
`teacherPageVersions` for that one page and calls `insertVersionTable` after
include expansion, so every `{@bso-versions}` line outside fenced code becomes a
Markdown table (or the table follows the first H1). The table contains only
versions, no build time, so output stays idempotent. The demo Docusaurus
preprocessor applies the same function; `bso preview` passes path and versions
via `BSO_PREVIEW_TEACHER_PAGE`.

Teacher progress dashboard (#37): `assets/teacher-dashboard/calc.js` is the single source of the pure calculation and threshold logic for student GitLab work items and repository stoplights. The page loads it as a classic script before `app.js`; the tests evaluate the same file through `tests/helpers/dashboard-calc.ts`, so they exercise the code that runs in the browser. The user interface in `app.js` is React 18 with htm (tagged templates instead of JSX), the same stack as the clickable prototype in owe-1, so no build step is needed. React, ReactDOM and htm are vendored in `assets/teacher-dashboard/vendor/` with pinned versions and SHA-256 hashes (see the README there) instead of loaded from a CDN, so the page in Brightspace runs no third-party code fetched at runtime. The fonts (Atkinson Hyperlegible Next and Mono, SIL OFL 1.1) are bundled too, so the dashboard makes no requests to third parties. The directive `{@bso-teacher-dashboard}` on the teacher page is handled by one remark plugin, `remarkTeacherDashboard` in `src/teacher-page.ts`, which both the Brightspace converter and the Docusaurus preview use (dev/prod parity, like `remarkFlashcards`). It wraps the page in two tabs, *Informatie* and *Voortgangsverkenner*, built from `hName`/`hProperties` nodes rather than raw HTML, with the dashboard in an `iframe` so its React app and CSS stay separate from the lesson page and the topic navigation script; `assets/brightspacosaurus-tabs.js` adds the tab behaviour in both environments, and without JavaScript both panels show one after the other. `src/teacher-dashboard.ts` writes the dashboard files; `prepare` writes them into the instructor module and `preview` into a static directory of the Docusaurus preview, so the preview runs the same dashboard. When `teacherDashboard` is configured in `brightspacosaurus.config.json`, `runPrepare` in `src/main.ts` generates `content/docenten/voortgangsverkenner.html`, `style.css`, `calc.js`, `app.js` and `vendor/` using bundled assets from `assets/teacher-dashboard/`. Cartridge generation in `src/manifest-builder.ts` categorizes content under `content/docenten/` into the instructor module (`module_docentenmateriaal`) with the title "Instructor material (hide after import)", ensuring it can be hidden from students after import. The client SPA executes entirely within the instructor's browser, keeping the token and all fetched data in memory only (with browser password manager support for the token), with selective student refresh, repo filters per assignment level and live threshold settings.

Quiz parsing and validation live in runtime-independent `src/quiz-parser.ts`;
`src/quiz-config.ts` supplies shared configuration validation/defaults. The QTI
converter validates again before serialization, refusing ungradable items.
`src/quiz-preview.ts` runs before Docusaurus' default remark plugins so generated
metadata reflects the transformed page. It uses the same parsed questions and
stable answer labels as QTI; `assets/brightspacosaurus-quizzes.js` shuffles DOM
options per attempt, preserving the scoring key. QTI expresses the setting as
`render_choice/@shuffle` (`Yes`/`No`), so build output remains deterministic.
`bso preview` passes resolved quiz settings through `BSO_PREVIEW_QUIZ_CONFIG`; the
demo falls back to its root course config when launched directly with npm.
A native Brightspace import still needs manual verification. Preview is practice,
with local feedback; it does not persist grades or enforce native attempt limits.

`src/course-linter.ts` adds read-only diagnostics on top of generic Markdown style
linting. It reuses the quiz validator, diagram checks and include syntax parser,
checks flashcard structure in the Markdown AST and follows local includes with
cycle detection. Diagnostics carry severity, rule, source file and one-based
line/column. Warnings do not fail the command; authoring errors do. This is the
first implementation slice of #11; per-rule enable/disable settings and broader
didactic standards remain follow-ups. `lint.includeDirs` selects recursive scan
roots in place of the configured source/reader directories; a `--sources` override
wins. Includes remain transitive dependencies and diagnostics are deduplicated
by file and sorted deterministically.

`lintMarkdown` accepts a third `LintOptions` argument with `flashcards` settings.
Configured headings must contain only complete term/definition bullet lists;
empty sections, prose, subheadings, code and invalid lists produce one
`flashcard-section-content` warning per affected section. List validation is
shared with the renderer. Rendering preserves content even when lint warns.

The separate `examples/demo-course-with-all-lint-issues` course contains 27
minimal lessons and an expected-rule manifest. Integration tests require exactly
one diagnostic per lesson and unique rules across all lessons; the regular demo
must emit none. Invalid directive nesting and malformed quiz answer keys report
the primary cause without a second derived diagnostic. Empty quiz options remain
in the parsed model long enough to produce the specific `quiz-option-text` error;
export still rejects them.

The shared implementation contracts belong with the relevant components and assets. The contribution rules in [CONTRIBUTING.md](../CONTRIBUTING.md) require new features to document and test both targets where applicable.

The significant architectural decisions are recorded as Architecture Decision Records in the [ADR index](adr/README.md).

### 8.2 Deno over Node.js — [ADR 008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md)

- **Context:** the tool runs in CI with repository and build-process access, making supply-chain security a first-class concern.
- **Decision:** use Deno as the runtime.
- **Rationale:** Deno's explicit permission model limits file access to declared paths, and it does not run postinstall scripts automatically — closing a well-known npm supply-chain vector.

### 8.3 unified (remark / rehype) for Markdown → HTML — [ADR 010](adr/adr010-brightspacosaurus-unified-markdown-pipeline.md)

- **Context:** Markdown must convert to clean, standalone HTML with GFM, frontmatter and rich content.
- **Decision:** use the unified pipeline (remark-parse, remark-gfm, remark-frontmatter, remark-rehype, rehype-stringify).
- **Rationale:** a well-established, composable, plugin-driven pipeline with predictable output.

### 8.4 Rich content in quiz questions — [ADR 011](adr/adr011-brightspacosaurus-rich-quiz-content.md)

- **Context:** quiz questions need more than plain text (code, formatting).
- **Decision:** support rich content in quiz Markdown when converting to QTI.
- **Rationale:** questions stay authored in Markdown while producing valid QTI 1.2 for Brightspace.

### 8.5 Reader PDF conversion via pandoc — [ADR 014](adr/adr014-brightspacosaurus-reader-pdf-conversion.md)

- **Context:** readers and the instructor manual need print-quality PDF output.
- **Decision:** convert reader Markdown to PDF via pandoc with a xelatex/lualatex engine, a custom LaTeX header and Lua filters.
- **Rationale:** pandoc gives high-quality typesetting; PDF generation is optional and skipped when pandoc is absent, so the core build never hard-depends on it.

Reader PDFs use a mandatory separate cover page ('voorblad', AIM Controle Kaart) before the table of contents. BSO derives deterministic cover metadata from reader frontmatter, the first H1, the configured course name, the configured version and, when `git` is available and permitted, the last commit date of the reader Markdown file. It deliberately does not inject the current date automatically because repeated builds must remain reproducible.

### 8.6 Publication via JSR — [ADR 015](adr/adr015-brightspacosaurus-publication-via-jsr.md)

- **Context:** the tool should be reusable both as an executable CLI and as an importable library.
- **Decision:** publish to JSR as `@bartvanderwal/brightspacosaurus`.
- **Rationale:** native Deno support with no separate build step, automatically indexed TypeScript types, versioning, and minimal impedance mismatch with the toolchain.

### 8.7 Asset loading via fetch + materialize for JSR compatibility — _(new; GitHub issue #5)_

- **Context:** bundled assets were loaded with `import.meta.url` + `Deno.readTextFile()`. This works from local source (`file://`) but fails from the JSR cache with _"Must be a file URL"_, because JSR serves modules over `https://`.
- **Decision:** introduce `src/assets.ts` with `loadAssetText` (`import.meta.resolve()` + `fetch()`) for text assets, and `materializeAsset` (write to a temp file) for external tools such as pandoc that require a real file path.
- **Rationale:** `fetch` works uniformly across `file://`, `https://` and `jsr:`; temp-file materialization bridges the gap for external processes that cannot read URLs. See GitHub issue #5.

### 8.8 Diagram rendering via remark-kroki-a11y — [ADR 016](adr/adr016-diagram-rendering-via-remark-kroki-a11y.md)

- **Context:** lesson HTML needs PlantUML/Mermaid rendering and accessibility support, while Brightspace topic content cannot safely assume custom JavaScript is available or allowed.
- **Decision:** run `remark-kroki-a11y` in-process, share one option mapper with preview, adapt provider HTML to native Brightspace disclosures, and keep offline validation reusable.
- **Rationale:** keeps rendering and natural-language descriptions in one upstream provider while giving BSO deterministic no-JS output and strict/fallback error policy.

### 8.9 Convention over configuration, with a config file for overrides — _(brightspacosaurus-generiek spec)_

- **Context:** the original tool was convention-based and tied to one specific course's directory layout.
- **Decision:** move to a "convention over configuration" approach: an opinionated setup with good, sensible defaults that works without any configuration, where everything can still be configured differently and project specifics live in `brightspacosaurus.config.json`.
- **Rationale:** decouples the tool from any single course, making it reusable and publishable, while a new course needs little or no configuration to get started. See `.kiro/specs/brightspacosaurus-generiek/`.

---

## 9. Deployment

This chapter describes how BSO is distributed and used: from JSR, in CI pipelines and in the manual import into Brightspace.

- **9.1** Distribution via JSR
- **9.2** CI pipeline usage
- **9.3** Manual import step

### 9.1 Distribution via JSR

```sh
# As a library
deno add jsr:@bartvanderwal/brightspacosaurus

# Run the CLI directly, no install
deno x jsr:@bartvanderwal/brightspacosaurus/cli prepare

# Or install a permanent command
deno install --allow-read --allow-write --allow-run=pandoc,git --allow-env --allow-net \
  -n brightspacosaurus jsr:@bartvanderwal/brightspacosaurus/cli
```

BSO is also usable from Node.js projects through Deno's npm-compatibility layer.

### 9.2 CI pipeline usage

A typical GitLab CI job runs `prepare` + `pack` and publishes the resulting `.imscc` as a build artifact:

```yaml
build-imscc:
  image: denoland/deno:latest
  script:
    - deno run --allow-read --allow-write --allow-run=pandoc --allow-env --allow-net
      jsr:@bartvanderwal/brightspacosaurus/cli prepare
    - deno run --allow-read --allow-write --allow-env
      jsr:@bartvanderwal/brightspacosaurus/cli pack
  artifacts:
    paths:
      - build/**/*.imscc
```

### 9.3 Manual import step

The final step — importing the `.imscc` into a Brightspace course — remains manual (Import/Export/Copy Components in Brightspace). See the [user manual](user-manual.md) and the README's Brightspace import section for the walkthrough and additive-import caveats.

---

## 10. Decision Log / Changelog

This chapter describes where decisions and changes are recorded: the ADRs, versioning and the history of the specifications.

- **10.1** Architecture Decision Records
- **10.2** Versioning
- **10.3** Spec history

### 10.1 Architecture Decision Records

The [`docs/adr/`](adr/README.md) directory is the running decision log:

| ADR                                                                           | Summary                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md) | Deno over Node.js — permission model and no auto postinstall scripts. |
| [010](adr/adr010-brightspacosaurus-unified-markdown-pipeline.md) | unified (remark/rehype) pipeline for Markdown → HTML. |
| [011](adr/adr011-brightspacosaurus-rich-quiz-content.md) | Rich content in quiz questions. |
| [014](adr/adr014-brightspacosaurus-reader-pdf-conversion.md) | Reader PDF conversion via pandoc. |
| [015](adr/adr015-brightspacosaurus-publication-via-jsr.md) | Publication via JSR. |
| [016](adr/adr016-diagram-rendering-via-remark-kroki-a11y.md) | Diagram rendering via remark-kroki-a11y with no-JS Brightspace adaptation. |

### 10.2 Versioning

The version lives in `deno.json` and follows semver (patch for bugfixes, minor for features on the current `0.x` line). The version is bumped in the same change as the corresponding feature or fix so the JSR publication stays correct. Significant behavioural changes are captured as ADRs and tracked as GitHub issues (for example, the JSR asset-loading fix under issue #5).

### 10.3 Spec history

Design and requirements history lives in two Kiro specs:

- `.kiro/specs/brightspacosaurus/` — the original bootstrap of the tool.
- `.kiro/specs/brightspacosaurus-generiek/` — the later step toward a generic, config-driven, JSR-published tool.

---

## References

- D2L. (n.d.-i). _Improve navigation in multi-page content topics_. Brightspace Community. Retrieved September 13, 2026, from https://community.d2l.com/brightspace/kb/articles/3365-improve-navigation-in-multi-page-content-topics
