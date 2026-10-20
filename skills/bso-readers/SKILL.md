---
name: bso-readers
description: "Create and troubleshoot BSO reader PDFs, including pandoc, PDF engines, fonts, Markdown frontmatter, includes, images, covers and logos."
---

# Create BSO readers

Use this when an author wants reference material as a PDF in a BSO course. Respond in the user's language, including Dutch prompts and labels when appropriate.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not silently upgrade.
- Required for PDF generation: Deno 2.0 or newer, `pandoc`, and a working PDF engine with the required fonts. Exact installation steps depend on the author's OS; check the official pandoc installation instructions instead of guessing package-manager commands.
- Reader files are Markdown in the configured `readersDir`; build needs permission to read sources and write the configured output.

## Workflow

1. Inspect `brightspacosaurus.config.json` for `readersDir`, cover/logo settings and output directory. Ask before adding a new directory or changing existing settings.
2. Put reader Markdown in `readersDir` and use the established reader filename convention (`reader-...`). Keep images and includes relative to their source files and ensure the referenced files exist.
3. Use supported frontmatter/includes from the [BSO reader guide](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/). Set cover and logo fields only to existing, approved assets; do not assume a field or image path.
4. Check `pandoc --version` and the PDF engine/fonts on the user's OS. Run `bso build --readers-only` to isolate reader generation, then inspect each generated PDF visually, including cover, page breaks, fonts, images, links and included content.

## Validate and recover

- If `pandoc` is missing, explain the OS-specific prerequisite and ask the user to install it; do not install software automatically.
- On a PDF build error, report the actual pandoc/engine diagnostic and identify the failing source. Do not silently skip a failed reader.
- A successful process exit is not visual validation. Confirm page rendering, font glyphs and image placement with the author.
- If an optional PDF dependency is intentionally unavailable, `bso build --skip-readers` can build the rest of the course, but state clearly that reader PDFs were not generated or checked.
- Do not put reader files or generated PDFs beside unrelated source files; generated output belongs in the configured build directory.
