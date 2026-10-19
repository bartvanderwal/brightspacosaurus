---
name: bso-content-authoring
description: "Write and review BSO course Markdown with includes, links/assets, accessible diagrams, flashcards, instructor tabs and optional preview-only Marp slides. Gebruik dit voor lessen schrijven, includes, links, afbeeldingen, diagrammen, flashcards, docentenpagina of Marp-slides."
---

# Author BSO course content

Use this for lessons and supporting Markdown in a BSO course. Respond in the user's language; preserve the source language and accessibility needs.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not silently upgrade.
- Required: Deno 2.0 or newer and read/write access to the configured course project. `pandoc` is only needed for PDFs; npm/Docusaurus is optional for preview and slide rendering.
- Keep student material in the configured `sourcesDir`; keep teacher-only materials outside it.

## Workflow

1. Inspect current naming, frontmatter, config and neighboring lesson style. Ask before changing existing content or adding optional features.
2. Write ordinary Markdown and use the supported include syntax `{@include: [Link text](relative/path.md)}`. Resolve internal links and assets relative to their source and verify every referenced file exists.
3. Use PlantUML/Mermaid fenced diagrams only where the configured renderer supports them. Add meaningful alt text or a textual explanation; do not rely on color or an image alone to convey essential information. Run lint and inspect the preview/export.
4. Use the documented flashcard syntax/config for explicit cards or glossary sections. Keep definitions readable without JavaScript and verify their keyboard/accessibility behavior in preview.
5. On the instructor page, use only documented tab/directive behavior and keep sensitive answers/data outside the student package.
6. Treat Marp slides as optional. Confirm the course has the documented slides configuration and rendering dependencies before adding slides; they are not a required representation of every lesson. Check notes and images for student visibility.

## Validate and recover

- Run `bso lint`; fix broken includes, unsupported markers and missing files at their source.
- Preview the lesson if configured and inspect the same material in a built cartridge for link/diagram/accessibility differences.
- If a syntax or config option is not in the current user manual, ask before inventing it.
- If diagrams cannot render, report the missing service/dependency and retain source text; do not replace content with an unexplained blank image.
- Do not add Marp, diagram or other dependencies without approval, and do not copy sensitive teacher content into student-visible sources.
