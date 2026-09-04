# AGENTS.md

These instructions apply to this repository and are the primary context for AI agents.

## Project context

- Project: **Brightspacosaurus** (BSO) — a CLI build tool that converts Markdown course material into an IMS Common Cartridge package (`.imscc`) for import into Brightspace.
- Runtime: **Deno** ≥ 2.0 (see `adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md`).
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

- `loadAssetText(name)` — loads text content via `import.meta.resolve()` + `fetch()` (works with `file://`, `https://` and `jsr:`).
- `materializeAsset(name)` — writes an asset to a temporary file and returns the path. Needed for external tools such as pandoc that require an actual file path (`--include-in-header`, `--lua-filter`).

Every new asset must also be included in `publish.include` in `deno.json`, otherwise it is not available from JSR.

## Engineering conventions

- Commands are idempotent: repeated execution on the same input produces identical output.
- Fail fast with useful error messages to `stderr`; progress to `stdout`.
- Deterministic file ordering when creating archives.
- All output goes to the build directory (`outputDir`), never next to source files.
- No hardcoded project-specific paths; everything via `brightspacosaurus.config.json` or CLI arguments.
- Location-independent: use `Deno.cwd()` as the repo root.

## Testing

- Test runner: Deno's built-in `deno test`.
- Property-based tests with fast-check (via JSR), at least 100 iterations per property.
- When making code changes, add or update tests: argument validation, deterministic output, error scenarios.
- Verify locally with `deno task test` before considering anything "done".
- For security-sensitive or build-wide changes: state what you verified and what you did not.

## Git and commits

- Commit messages in English.
- The commit title briefly captures **what** changed and **why**: `what, because why; see #issue`. Guideline: max ~72 characters for the title; prefer small, logically coherent commits over one large one.
- Preferably include an issue number in the commit. If there is no matching issue and the change is more than minor maintenance, first create or request an issue so the rationale can live there.
- **Workflow for agents**: for every commit request, first look up relevant open issues via `gh issue list` and include the matching issue numbers in the commit title. Use `Closes #N` when the commit closes an issue.
- **Do NOT commit and push spontaneously after every change.** The user wants to review changes first via the Git Changes view and test them personally. Only commit and push at the user's explicit request.
- Split large changes into logically coherent commits per topic.
- Untracked files should be committed or added to `.gitignore` — do not leave them lying around.
- Push to a separate branch, never directly to `main`, unless explicitly requested.

## Versioning and publishing

- The version lives in `deno.json`. Follow semver: patch for bugfixes, minor for features (0.x).
- Bump the version in the same change as the corresponding feature/fix, so the JSR publication is correct.
- Publishing to JSR (`deno publish`) is done by the user, unless agreed otherwise (auth prompt).
- After a fix that affects JSR behavior: verify locally first, then publish, and only then test the JSR variant (chicken-and-egg: the JSR version can only be tested after publishing).
- **Publishing to JSR:** `deno publish` (done by the user).
- **Publishing to npm — important:** do NOT publish directly from the `.tgz` tarball (`npm publish ./file.tgz`). Due to a known npm CLI bug ([npm/cli#3548](https://github.com/npm/cli/issues/3548)), publishing from a tarball leaves the per-version `readme` field empty, so the npm website shows "This package does not have a README". Instead, publish from the extracted package directory so npm picks up the README:
  ```sh
  deno pack --ignore='tests/' --ignore='**/*_test.ts' --ignore='**/*.test.ts' --ignore='src/marp-exporter.ts'
  tar -xzf bartvanderwal-brightspacosaurus-<version>.tgz
  cd package && npm publish --access public && cd ..
  rm -rf package
  ```
- The first publish of the scoped package needs `--access public`; npm remembers it afterwards.

## Spec workflow

The feature spec for making BSO generic lives in `.kiro/specs/brightspacosaurus-generiek/` (requirements, design, tasks). Keep task statuses in `tasks.md` up to date during execution.
