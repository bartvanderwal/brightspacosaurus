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

This produces `build/brightspace/demo-course.v1.0.0.imscc`, ready to import into Brightspace.

> Note: diagram rendering in the Brightspace HTML output is planned (see issue #14). For now, PlantUML/Mermaid render in reader PDFs; in lesson HTML they appear as code blocks.
