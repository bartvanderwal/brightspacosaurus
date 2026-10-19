---
name: bso-brightspace-export
description: "Build and pack a BSO course, then plan a safe Brightspace sandbox import with version control, selective/additive behavior, hidden teacher material and navigation checks. Gebruik dit voor BSO-export, .imscc, Brightspace-import, opnieuw importeren of navigatiecontrole."
---

# Export and import a BSO course

Use this when preparing a course cartridge or guiding an instructor through a Brightspace import. Respond in the user's language.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not silently upgrade.
- Required: Deno 2.0 or newer, a valid course config and approved read/write permissions. `pandoc` is needed only when generating PDFs.
- Instructor authorization and access to a non-production Brightspace sandbox are required before importing.

## Workflow

1. Confirm the working tree and course config; keep source and config changes in version control. Run `bso --version` and `bso lint`.
2. Confirm student-visible sources exclude answer keys and other teacher-only materials. Do not assume a hidden Brightspace topic prevents direct access; keep sensitive instructor material out of the student cartridge.
3. Build and pack from the course root with `bso build` and `bso pack`. Inspect output path, course/BSO versions, navigation, pages, quiz files, reader PDFs and assets. Keep generated files in the build directory.
4. Import into a sandbox. Brightspace imports can be additive and create duplicates on re-import; for a clean replacement, follow the instructor's approved deletion/selective-import procedure. Never delete production course items yourself.
5. Check module/topic order, links, quizzes, images, reader links, teacher-only visibility and navigation in the sandbox. Obtain instructor sign-off before production import.

## Validate and recover

- If lint, build or pack fails, stop before import and report the exact diagnostic.
- If PDF dependencies are intentionally absent, use `bso build --skip-readers` only when approved and call out that PDFs were skipped.
- A successful `.imscc` build does not validate Brightspace import. Do not claim import compatibility until sandbox checks pass.
- If a repeat import may duplicate items, stop and clarify whether the target course should be cleaned or selective import should be used.
- Do not upload, overwrite, delete or change course visibility without explicit authorization.

See the [Brightspace import guide](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/) for current additive and selective import behavior.
