# Demo Course

A minimal, generic example course that demonstrates Brightspacosaurus features:

- A lesson page with fenced code blocks (copy-to-clipboard button; color highlighting in Docusaurus preview only for now).
- A quiz (`quiz-` prefix) converted to QTI 1.2.
- A reader (`reader-` prefix) converted to PDF via pandoc, including a diagram-as-code example.
- A PlantUML class diagram (diagrams-as-code).

## Try it

From this directory:

```sh
bso prepare
bso pack
```

This produces `build/brightspace/demo-course.v0.9.2.imscc`, ready to import into Brightspace. The `.imscc` postfix follows the BSO package version in the repository's `deno.json`; the course content version remains configured separately as configured in BSO configuration file `brightspacosaurus.config.json`.

> Note: diagram rendering in the Brightspace HTML output is planned (see issue #14). For now, PlantUML/Mermaid render in reader PDFs; in lesson HTML they appear as code blocks.
