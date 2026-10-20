---
name: bso-upgrade-troubleshooting
description: "Diagnose BSO CLI/runtime, source-checkout and Docusaurus npm-package version mismatches, breaking migrations and Deno permissions without changing them silently."
---

# Diagnose BSO version and setup issues

Use this when a BSO command fails or a course may mix different BSO installations. Respond in the user's language.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check the actual installed version with `bso --version`.
- Required runtime: Deno 2.0 or newer. Docusaurus preview also has its own Node/npm package dependencies; pandoc is needed only for PDF generation.
- Read access to the course config, package manifest and lockfiles. Do not modify them without approval.

## Workflow

1. Identify the failing command and execution context: globally installed `bso`, `deno run`/JSR source, local BSO checkout, or the npm package used by Docusaurus.
2. Collect non-secret diagnostics: `bso --version`, `deno --version`, package-manager version, relevant package/lockfile versions and the exact error. Do not ask for tokens, `.env` contents or private student data.
3. Compare the relevant component versions; do not assume updating the CLI changes the Docusaurus dependency, or that a local checkout matches the published JSR/npm package.
4. Consult the release notes and migration guide for the versions involved. Explain the smallest explicit change and its effects; ask before installing, updating, editing lockfiles or changing Deno permissions.
5. Grant only the permission needed for the command. Build may need source reads, output writes, subprocesses such as pandoc/git and network for configured services; preview invokes npm. Explain each requested permission rather than recommending `-A` by default.

## Validate and recover

- Re-run the exact failing command after an approved change and report the version/permission that changed.
- If the failure remains, preserve the full diagnostic and isolate CLI/runtime errors from Docusaurus plugin/build errors and pandoc failures.
- Do not silently run a formatter, install dependencies, rewrite config, or migrate a course to a guessed syntax.
- For an unrecognized breaking change, stop and ask for the source version and expected behavior; do not claim an undocumented migration.
- Never place credentials in a repository config, command line, generated example or shared log.

See the [BSO release notes](https://github.com/bartvanderwal/brightspacosaurus/blob/main/CHANGELOG.md) and [installation guide](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/).
