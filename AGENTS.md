# AGENTS.md

These instructions apply to this repository and are the primary context for AI agents.

## Project context

- Project: **Brightspacosaurus** (BSO) — a CLI build tool that converts Markdown course material into an IMS Common Cartridge package (`.imscc`) for import into Brightspace.
- Runtime: **Deno** ≥ 2.0 (see `docs/adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md`).
- Language: **TypeScript**.
- Distribution: published to **JSR** as `@bartvanderwal/brightspacosaurus`; npm-compatible via Deno's compatibility layer.
- The tool is generic: project-specific settings come from `brightspacosaurus.config.json`, not from the source code.

## Architecture

The core consists of separate modules under `src/`:

- `main.ts` — CLI entry point (commands `prepare` and `pack`), guarded with `import.meta.main`.
- `config-loader.ts` — loads, validates and resolves `brightspacosaurus.config.json`.
- `source-scanner.ts` — scans source directories and classifies files by prefix.
- `markdown-converter.ts` — Markdown to HTML (unified/remark/rehype).
- `quiz-converter.ts` — quiz Markdown to QTI 1.2 XML.
- `reader-pdf-converter.ts` — reader Markdown to PDF via pandoc.
- `manifest-builder.ts` — generates `imsmanifest.xml`.
- `packer.ts` — packs the build directory into a `.imscc` archive.
- `assets.ts` — loads bundled assets (CSS, LaTeX, Lua) via `import.meta.resolve()` + `fetch()`.
- `mod.ts` — barrel export for library use via JSR.

## Loading assets (important for JSR compatibility)

Bundled assets (in `assets/`) must NEVER be loaded via `import.meta.url` + `Deno.readTextFile()`. That works locally (`file://`) but fails from the JSR cache (`https://`) with "Must be a file URL".

Use `src/assets.ts` instead:

- `loadAssetText(name)` — loads text content via `new URL(…, import.meta.url)` + `fetch()` (works with `file://`, `https://` and `jsr:`). `loadAssetBytes(name)` does the same for binary assets such as fonts.
- `materializeAsset(name)` — writes an asset to a temporary file and returns the path. Needed for external tools such as pandoc that require an actual file path (`--include-in-header`, `--lua-filter`).

Every new asset must also be included in `publish.include` in `deno.json`, otherwise it is not available from JSR.

## Engineering conventions

- **Easy to use, hard to make.** The effort belongs in the tool, not with the user, as long as the feature is valuable to end users. Prefer one command that does the right thing in context (for example `bso lint` follows the configuration of the current directory and says what it scanned) over several specialized commands, flags or settings. Support both of two reasonable syntaxes instead of adding a setting to choose. Do not add configuration for a choice BSO can make itself.
- Commands are idempotent: repeated execution on the same input produces identical output.
- Fail fast with useful error messages to `stderr`; progress to `stdout`.
- Deterministic file ordering when creating archives.
- All output goes to the build directory (`outputDir`), never next to source files.
- Never write files outside the repository (e.g. `/tmp`), also not for temporary logs or scratch output; use the gitignored `build/` directory instead.
- No hardcoded project-specific paths; everything via `brightspacosaurus.config.json` or CLI arguments.
- Location-independent: use `Deno.cwd()` as the repo root.

## Documentation

- ADRs in `docs/adr/` are immutable once accepted. Only typo fixes and small corrections shortly after writing are allowed. To change a decision, write a new ADR and mark the old one as deprecated or superseded, with a link to the new one.
- Design and code-level explanations (how something is implemented, plugin choices within an existing architecture) belong in the Software Guidebook, chapter 7 "Code", not in an ADR.
- **Put images in the text, never hidden in an appendix.** Place every image exactly where the reader needs it, not in a "Bijlagen"/"Appendix" section (except material that is truly supplementary). Give each image a figure number and a short caption ("Figure 3. ..." in English, "Figuur 3. ..." in Dutch), refer to it from the running text, add a short explanation that says what to look at and what to take away (in Dutch docs: "Toelichting"), and give it meaningful alt text. Write the caption first, keep it brief, limit a diagram to about one paragraph's worth of information, and use a callout or crop to focus attention. Reason: readers love pictures. Google's Technical Writing course puts it this way: "when it comes to reading technical material, the vast majority of adults are still little kids—still yearning for pictures rather than text" (Google, n.d.).
- Cite sources in APA 7 style: an in-text citation like (Google, n.d.) and a "Sources" section at the end of the document with the full references. Only cite pages you actually read; say so when a page could not be fetched and you relied on a search snippet or on text supplied by the user.

Reference for the rule on images:

Google. (n.d.). *Illustrating*. In *Technical Writing Two*. Google for Developers. <https://developers.google.com/tech-writing/two/illustrations>

## Testing

- Test runner: Deno's built-in `deno test`.
- Property-based tests with fast-check (via JSR), at least 100 iterations per property.
- When making code changes, add or update tests: argument validation, deterministic output, error scenarios.
- While developing, run `deno task test:fast` (under a minute): all tests except the pandoc PDF conversion tests. Tests that call `runPrepare` without testing PDFs pass `{ skipReaders: true }`.
- Run the full `deno task test` (several minutes, includes `test:pdf`) before considering anything "done" or committing, and when touching reader, instructor-manual or pandoc code.
- For local builds where PDFs do not matter, use `prepare --skip-readers`: it skips all PDF generation with pandoc (readers, instructor manual, user manual) and still copies pre-built PDFs.
- Run long test suites in the background and keep working or reporting in the meantime; do not leave the user waiting on a silent foreground run.
- Follow the project Definition of Done in `docs/definition-of-done.md`, including **80% or higher line coverage**. Also report branch and function coverage, because line coverage alone does not prove both sides of conditional behavior are tested.
- For security-sensitive or build-wide changes: state what you verified and what you did not.

## Git and commits

- Commit messages in English.
- The commit title briefly captures **what** changed and **why**: `what, because why; see #issue`. Guideline: max ~72 characters for the title; prefer small, logically coherent commits over one large one.
- Preferably include an issue number in the commit. If there is no matching issue and the change is more than minor maintenance, first create or request an issue so the rationale can live there.
- **Workflow for agents**: for every commit request, first look up relevant open issues via `gh issue list` and include the matching issue numbers in the commit title. Use `Closes #N` when the commit closes an issue.
- **Do NOT commit and push spontaneously after every change.** The user wants to review changes first via the Git Changes view and test them personally. Only commit and push at the user's explicit request.
- Split large changes into logically coherent commits per topic.
- Untracked files should be committed or added to `.gitignore` — do not leave them lying around.
- Branching follows GitHub Flow (`docs/adr/adr018-github-flow-and-release-tags.md`): `main` is the only long-lived branch; no `develop`, `release/*` or `hotfix/*` branches.
- Commit directly to `main` by default (still only when the user asks to commit).
- Only large changes that colleagues should review get a feature branch `feature/<issue>-<slug>` from the current `main` and a pull request. If unsure whether a change is large enough, ask. Delete the branch after merge.

## Versioning and publishing

- The version lives in `deno.json`. Follow semver: patch for bugfixes, minor for features (0.x).
- Bump the version in the same change as the corresponding feature/fix, so the JSR publication is correct.
- Publishing to JSR (`deno publish`) is done by the user, unless agreed otherwise (auth prompt).
- Publish from the intended commit on `main` and tag it `vX.Y.Z` (ADR 018).
- After a fix that affects JSR behavior: verify locally first, then publish, and only then test the JSR variant (chicken-and-egg: the JSR version can only be tested after publishing).
- **Publishing to JSR:** `deno publish` (done by the user).
- **Publishing to npm:** run `deno task release:npm` (`utils/release-npm.ts`, #77) from the clean, tagged commit. It runs every step in order, and `deno task release:npm --dry-run` does the same without publishing. The steps:
  - Check `npm whoami` first. A publish without a valid login fails with a misleading `404 Not Found`; run `npm login` first.
  - Pack into `build/npm-release/`, so no `package/` or `.tgz` lands in the repo root.
  - Fix two `deno pack` quirks: delete the empty `assets/*.d.ts.d.ts` file, and add the `types` condition for the `./tabs` export.
  - Publish from the extracted folder, not from the `.tgz` tarball. Publishing from a tarball leaves the npm README empty because of a known npm CLI bug ([npm/cli#3548](https://github.com/npm/cli/issues/3548)).
  - Clean up `build/npm-release/`.
- `deno pack` reports "Could not generate types" for internal modules such as `assets.ts`, `quiz-markdown.ts` and `teacher-dashboard.ts`. This is expected. It only emits `.d.ts` files for modules that the public type surface references, and no published `.d.ts` imports these modules.
- The first publish of the scoped package needs `--access public`; npm remembers it afterwards.

## Spec workflow

The feature spec for making BSO generic lives in `.kiro/specs/brightspacosaurus-generiek/` (requirements, design, tasks). Keep task statuses in `tasks.md` up to date during execution.
