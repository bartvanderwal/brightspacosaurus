---
name: bso-course-lint
description: "Run BSO course lint, interpret and fix authoring diagnostics, and show file:line:column locations in an editor. Gebruik dit voor bso lint, cursusmateriaal controleren, quizfouten of foutmeldingen in VS Code."
---

# Lint BSO course material

Use this when an author asks to validate or repair course sources. Respond in the user's language; explain diagnostic messages in Dutch for Dutch prompts.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not upgrade it without approval.
- Required: Deno 2.0 or newer, a valid course config and read access to the configured course sources.
- `bso lint` does not require pandoc or GitLab credentials. Do not request or create tokens for linting.

## Workflow

1. From the course root, run `bso lint`; use only the permissions already approved for this project.
2. Preserve the exact diagnostic and its file, line and column. Explain the rule and the smallest source edit that would resolve it. Ask before changing course content.
3. Rerun `bso lint` after approved changes and report remaining errors/warnings separately.
4. To show a diagnostic in VS Code's Problems panel, first verify that the installed CLI output matches an existing problem matcher or an explicitly configured task. Otherwise display the diagnostic in the terminal and provide a link to the file/line if the editor supports it.

## Validate and recover

- A nonzero exit means the course has lint errors; do not proceed as if validation passed. Warnings should be explained, not automatically “fixed.”
- If output lacks a column or does not match a VS Code matcher, do not claim native Problems-panel integration. Avoid adding an unverified task matcher or an extension.
- There is no BSO TODO-extension integration established by this skill. Do not describe lint messages as TODOs or claim a TODO extension can import them.
- If `bso lint` is unavailable, report the CLI version/install issue and stop; do not substitute an unrelated Markdown linter for BSO-specific validation.

See the [BSO course-lint guide](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#bso-lint) for supported checks.
