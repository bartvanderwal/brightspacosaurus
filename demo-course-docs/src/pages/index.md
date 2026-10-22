---
title: Brightspacosaurus
description: Two example courses, the user manual and the software guidebook of Brightspacosaurus
hide_table_of_contents: true
---

# Brightspacosaurus

Brightspacosaurus (BSO) turns Markdown course material into a Brightspace package (`.imscc`): lessons become pages, quizzes become native QTI tests, readers become PDFs. This site shows the tool at work, with two example courses built from Markdown in the [open-source repository](https://github.com/bartvanderwal/brightspacosaurus), and the documentation of BSO itself.

## Example courses

Each example has its own `brightspacosaurus.config.json` and shows a different way to organise a course. Open a lesson and press Alt/Option+P to see it as slides (Esc closes them).

| Example | Organised by | What it shows |
| --- | --- | --- |
| [Example: weeks](/lessons/) | a folder per week | the features one by one, with a page per feature (WAT and HOE), quizzes, flashcards, diagrams, a reader and slides without a banner |
| [Example: topics](/cursorisch-aanbod/lessons/introduction/) | a folder per topic | the menu per topic from the title of each `index.md`, readers in a content module, and slides with a banner text |

The sources are in [`examples/`](https://github.com/bartvanderwal/brightspacosaurus/tree/main/examples).

## Documentation

- [User manual](/guidebook/user-manual): install, configure, build and import into Brightspace.
- [Software guidebook](/guidebook/software-guidebook): architecture, modules and design decisions.

## Install

```sh
deno install -A -g -n bso jsr:@bartvanderwal/brightspacosaurus/cli
```

See the [README](https://github.com/bartvanderwal/brightspacosaurus#readme) for the first steps.
