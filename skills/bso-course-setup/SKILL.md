---
name: bso-course-setup
description: "Set up a Markdown course for Brightspacosaurus: inventory lessons, choose source folders and prefixes, configure, build and pack."
---

# Set up a BSO course

Use this workflow when an author is starting a BSO client project or bringing existing Markdown lessons into one. Respond in the user's language; Dutch prompts and Dutch course content are supported.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check the installed CLI with `bso --version`; do not silently install or upgrade it.
- Required: Deno 2.0 or newer. `pandoc` is optional unless the course generates reader or instructor PDFs.
- Build and pack need read/write access to the course project. Build can also need network access for configured diagram rendering; use only the permissions approved for the project.

## Workflow

1. Inventory existing Markdown, images, partials/includes, quizzes, readers, instructor-only material and any existing Docusaurus app. Preserve original files; do not move or rename content until the author approves a proposed layout.
2. Agree on separate source folders for student lessons/quizzes and readers. Keep answer keys and other teacher-only content outside the student `sourcesDir`; do not rely on hiding a student-directory file as protection.
3. Propose a minimal `brightspacosaurus.config.json` using the actual course name and a user-approved course version:

   ```json
   {
     "courseName": "My Course",
     "version": "1.0.0",
     "sourcesDir": "lessons/"
   }
   ```

   Add `readersDir`, `assetsDir`, `docusaurusDir` or other fields only if the inventory requires them. Use `quiz-` for quiz filenames. Reader Markdown belongs in the configured `readersDir`.
4. Check the runtime and configured project before invoking commands: `deno --version`, `bso --version`, and confirm the config is in the course root. If `bso` is missing or outdated, explain the installed-versus-required versions and ask before changing it.
5. Run `bso lint` first and resolve errors against the source. Then run `bso build` and `bso pack`. If PDFs are not part of this setup or pandoc is unavailable, `bso build --skip-readers` skips PDF generation; explain that the reader output was not validated.
6. Report the generated `.imscc` path and any skipped validation. Do not import into Brightspace without explicit authorization.

## Validate and recover

- Confirm build and pack exit successfully and the cartridge exists under the configured output directory.
- If configuration validation fails, use the reported field/path to correct the config with the author; do not guess undocumented fields.
- If lint reports a source error, show its file and location, explain the failing BSO rule, and fix only with approval.
- If PDF generation fails, check `pandoc` and its PDF engine/fonts with `bso-readers`; do not claim a PDF was generated.
- If files could be student-visible, stop and ask the instructor to review the source separation before building or importing.

See the [BSO user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/) for current configuration and publishing details.
