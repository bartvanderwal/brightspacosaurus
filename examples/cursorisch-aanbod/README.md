# Intro to Agentic UI patterns (course per topic)

A small, fictional example of a course organised **per topic** instead of per week. Use it to see how the Brightspace menu follows your folders.

## Structure

```text
lessons/
  introduction/   index.md  lesson-1-what-is-agentic-ui.md
  patterns/       index.md  lesson-1-…  lesson-2-…  quiz-1-patterns.md
  evaluation/     index.md  lesson-1-trust-and-recovery.md
  algemeen/       index.md  lesson-1-about-this-course.md
readers/          reader-agentic-ui-glossary.md
```

- Each folder directly under `sourcesDir` is a menu module (a main menu item).
- The module name is the title (the H1) of that folder's `index.md`. Without an `index.md`, the folder name is used. To rename a menu item, change the H1 of its `index.md`.
- Order inside a module follows `sidebar_position` in the front matter.
- **Readers in a content module.** `readersModule` (`{ "slug": "algemeen", "title": "Algemeen" }`) puts the reader PDF in the `algemeen` module, after its pages. The [demo-course](../demo-course) keeps the default, a separate `Readers` module, so both situations are covered by an example.
- **Diagrams** use a local Kroki server (`diagrams.krokiUrl` is `http://localhost:8000/`). Without it, remove `diagrams` from the configuration to use the default, `https://kroki.io`.
- No Docusaurus files are needed: no `_category_.json` and no `sidebars.js` (BSO does not read them).
- The course title (`courseName`) is in `brightspacosaurus.config.json`.

## Try it

From this directory:

```sh
bso lint
bso build --skip-readers
```

The build output goes to `build/brightspace/` (ignored by Git). See also [demo-course](../demo-course), which is organised per week, and issue #125.
