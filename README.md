<p align="center">
  <img src="docs/images/bsosaurus-logo.png" alt="Brightspacosaurus logo" width="200">
</p>

# Brightspacosaurus

Brightspacosaurus is a CLI tool that converts Markdown course material into a Brightspace Common Cartridge (`.imscc`) package. Created by Bart van der Wal, lecturer in Software Engineering at the HAN University of Applied Science, Academy of IT and Media Design.

📖 See the [user manual](docs/brightspacosaurus-handleiding.md) for the data model and Brightspace import process, and the [Software Guidebook](docs/software-guidebook.md) for the architecture and design decisions.

## Requirements

- [Deno](https://deno.com/) ≥ 2.0 — see [ADR 008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md) for the rationale
- [pandoc](https://pandoc.org/) (optional) — required for reader-PDF generation and the instructor manual

## Installation

### Via JSR

```sh
deno add jsr:@bartvanderwal/brightspacosaurus
```

You can also run the CLI directly without installing:

```sh
deno x jsr:@bartvanderwal/brightspacosaurus/cli prepare
```

### Locally

```sh
git clone <repository-url>
cd brightspacosaurus
deno task prepare
```

## Quickstart

1. Create a `brightspacosaurus.config.json` in the root of your course project:

```json
{
  "courseName": "My Course",
  "version": "1.0.0",
  "sourcesDir": "source-material/lessons/"
}
```

2. Generate HTML and QTI from your Markdown source files:

```sh
deno run --allow-read --allow-write --allow-run --allow-env src/main.ts prepare
```

3. Package the build output into a `.imscc` archive:

```sh
deno run --allow-read --allow-write --allow-env src/main.ts pack
```

The result is a file such as `build/brightspace/my-course.v1.0.0.imscc` that you can import into Brightspace.

## Configuration

All project-specific settings are managed via `brightspacosaurus.config.json`. CLI arguments take precedence over values from the configuration file.

### Required fields

| Field | Type | Description |
|------|------|-------------|
| `courseName` | `string` | Course name as shown in the manifest |
| `version` | `string` | Version number (semver), used in the .imscc file name and HTML badge |
| `sourcesDir` | `string` | Source directory for lesson pages and quizzes (relative to the working directory) |

### Optional fields

| Field | Type | Default | Description |
|------|------|-----------|-------------|
| `name` | `string` | derived from `courseName` | Project name for the .imscc file |
| `readersDir` | `string` | `null` (skip) | Source directory for reader Markdown (PDF conversion via pandoc) |
| `assetsDir` | `string` | `null` (no extra assets) | Directory with static assets (banners, logos) |
| `outputDir` | `string` | `"build/brightspace"` | Build output directory |
| `customCss` | `string` | `null` (default CSS only) | Path to a custom CSS file |
| `docentenHandleiding` | `object` | `null` (skip) | Configuration for the instructor manual PDF |

### docentenHandleiding object

| Field | Type | Default | Description |
|------|------|-----------|-------------|
| `inputFiles` | `string[]` | (required) | List of Markdown source files (relative to the working directory) |
| `outputName` | `string` | `"docentenhandleiding.pdf"` | File name for the output PDF |
| `outputDir` | `string` | `<outputDir>/docenten/` | Output directory for the PDF |

### Full example

```json
{
  "courseName": "Software Engineering",
  "version": "2.1.0",
  "name": "SE",
  "sourcesDir": "student-material/lessons/",
  "readersDir": "student-material/readers/",
  "assetsDir": "images/",
  "outputDir": "build/brightspace",
  "customCss": "assets/custom.css",
  "docentenHandleiding": {
    "inputFiles": [
      "instructor-manual/chapter-1.md",
      "instructor-manual/chapter-2.md"
    ],
    "outputName": "docentenhandleiding-se.pdf",
    "outputDir": "build/brightspace/docenten"
  }
}
```

## CLI options

```
Usage: brightspacosaurus <command> [options]

Commands:
  prepare   Convert Markdown source files to HTML and quiz Markdown to QTI
  pack      Package the build directory into a .imscc archive

Options:
  --config <path>    Path to the configuration file (default: brightspacosaurus.config.json in cwd)
  --sources <dir>    Source directory for lesson and quiz Markdown (overrides config.sourcesDir)
  --output <path>    Output path (overrides config.outputDir)
  --readers-only     Generate reader and instructor PDFs only
```

CLI arguments always take precedence over values from the configuration file.

## Commands

### Running tests

```sh
deno task test
```

Runs all unit and property-based tests.

### Prepare (Markdown → HTML + QTI)

```sh
deno task prepare
```

Scans the configured source directory and:
- Converts lesson Markdown to standalone HTML
- Converts quiz Markdown (prefix `quiz-`) to QTI 1.2 XML
- Converts reader Markdown (prefix `reader-`) to PDF via pandoc (if configured)
- Generates the instructor manual PDF (if configured)
- Copies referenced images into the build directory

### Pack (HTML + QTI → .imscc)

```sh
deno task pack
```

Packages the contents of the build directory into a `.imscc` archive including `imsmanifest.xml`.

## Importing into Brightspace

After generating the `.imscc` file, import it into Brightspace as follows:

1. Go to the course you want to import into.
2. Open **Course tools** → **Import/Export/Copy Components**.
3. Scroll to the **Import Components** section and select the radio button.
4. Choose **from a course package** (not "from a learning object repository").
5. Click **Start**.
6. Drag the `.imscc` file (e.g. `course.v1.0.0.imscc`) onto the upload area (or click to browse).
7. Choose **Import All Components**.
8. Wait for the import to complete (this can take a few minutes; progress is shown with green checkmarks).

## Brightspace import limitations

Brightspace Common Cartridge import is additive for content modules and quizzes: it adds items but does not remove or overwrite existing modules or quizzes. There is no deduplication based on identifier or title.

The import wizard does offer the **"Overwrite existing files"** option. This applies to files in Manage Files (images, PDFs, HTML files) — not to content modules or quizzes as a whole.

This means:

- Re-importing into the same course produces duplicates for modules and quizzes.
- Files (images, PDFs) are overwritten if the option is checked and the path matches.
- Removing previously imported content modules must be done manually in Brightspace.
- There is no "sync" or "deploy" — only a one-way push.

### Recommended workflow

- **Iterating/testing**: import into a clean course (create a new sandbox or reset the existing one).
- **Production**: import once into the target course. When making changes: use "Import Selected Components" to add only changed modules, and manually remove what has been replaced.
- **Alternative**: generate per-module packages instead of a single course package, so you can import selectively with limited damage from duplicates.

### Cleaning up before re-import

Because import is additive for modules and quizzes, you must manually remove old items before importing again.

#### Content (lesson material)

1. Go to **Content** in the course.
2. Navigate to the module(s) you want to re-import.
3. Click the dropdown menu (⋮) next to the module → **Delete Module**.
4. Confirm. This removes the module including all topics within it.

#### Quizzes

1. Go to **Assessment** → **Quizzes**.
2. Check the quizzes belonging to the previous import (recognizable by name/prefix).
3. Click **Delete** (at the top of the list).
4. Confirm the deletion.

Note: if a quiz already contains attempts (student results), Brightspace will warn you. In that case only delete in a test/sandbox course, or archive the results first.

#### Order

1. First remove the old content and quizzes.
2. Then import the new `.imscc` package.
3. Verify that the new items appeared correctly.

The source of truth remains Git. Brightspace is the distribution channel, not the store of record.

## Project structure

```text
brightspacosaurus/
├── deno.json                  # tasks, imports and JSR publish config
├── README.md                  # this file
├── SKILL.md                   # agent instructions for Kiro
├── src/
│   ├── types.ts               # TypeScript interfaces
│   ├── config-loader.ts       # load, validate and merge configuration
│   ├── source-scanner.ts      # scan source directories
│   ├── markdown-converter.ts  # Markdown → HTML (unified/remark)
│   ├── manifest-builder.ts    # generate imsmanifest.xml
│   ├── quiz-converter.ts      # quiz Markdown → QTI XML
│   ├── reader-pdf-converter.ts # reader Markdown → PDF (pandoc)
│   ├── packer.ts              # HTML + QTI → .imscc
│   └── main.ts                # CLI entry point
├── assets/
│   ├── brightspacosaurus.css  # default stylesheet (HAN house style)
│   ├── reader-header.tex      # pandoc LaTeX header for readers
│   └── include-filter.lua     # pandoc Lua filter
├── tests/
│   ├── config-loader.test.ts
│   ├── config-loader.property.test.ts
│   ├── source-scanner.test.ts
│   ├── markdown-converter.test.ts
│   ├── manifest-builder.test.ts
│   ├── quiz-converter.test.ts
│   ├── packer.test.ts
│   └── cli.test.ts
├── utils/
│   └── verwijder-brightspace-paginas.js  # experimental cleanup utility
├── adr/                       # Architecture Decision Records
├── docs/
│   ├── brightspacosaurus-handleiding.md
│   └── software-guidebook.md
└── examples/
    └── *.config.json          # example configurations
```

## Design decisions

- **Deno as runtime** instead of Node.js — see [ADR 008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md)
- **unified (remark/rehype)** for Markdown → HTML — see [ADR 010](adr/adr010-brightspacosaurus-unified-pipeline-markdown-conversie.md)
- **Property-based testing** with fast-check — see [ADR 011](adr/adr011-brightspacosaurus-rijke-inhoud-quizvragen.md)
- **Reader-PDF conversion via pandoc** — see [ADR 014](adr/adr014-reader-pdf-conversie-via-brightspacosaurus.md)
- **JSR as the primary distribution channel** — see [ADR 015](adr/adr015-brightspacosaurus-publicatie-via-jsr.md)
- **Config-driven with sensible defaults** — project-specific settings via `brightspacosaurus.config.json`, CLI arguments take precedence over config
- All output in `build/`, never next to source files
- Deterministic file ordering for reproducible archives

For the full rationale behind these choices, see the Design Decisions chapter in the [Software Guidebook](docs/software-guidebook.md).

## Spec

BSOsaurus was set up with AWS' Kiro, a Spec-Driven Development tool (AI tool).

The full feature spec (requirements, design, tasks) lives in the Kiro specs in this repo:
- [`.kiro/specs/brightspacosaurus-generiek/`](.kiro/specs/brightspacosaurus/), the original bootstrap
- [`.kiro/specs/brightspacosaurus-generiek/`](.kiro/specs/brightspacosaurus-generiek/), the later step toward a separate, more generic tool and JSR module
- Possibly more later...

<p align="center">
  <img src="docs/images/brightspacosaurus-big.png" alt="Brightspacosaurus hero" width="600">
</p>
