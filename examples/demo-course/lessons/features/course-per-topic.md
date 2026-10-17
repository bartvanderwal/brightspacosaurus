---
sidebar_position: 3
---

# A course per topic

The Brightspace menu does not need weeks. Every first-level folder in `sourcesDir` becomes a main menu item, so a folder per topic gives a menu per topic. The name of a menu item is the title (the H1) of that folder's `index.md`. To rename a menu item, change that title.

```text
Menu in Brightspace          Folder in sourcesDir
Introduction                 introduction/
Agentic UI patterns          patterns/
Algemeen                     algemeen/   (also holds the reader PDFs)
```

A complete example course per topic is in `examples/cursorisch-aanbod`.

<details>
<summary>How to set up a course per topic</summary>

Make a folder per topic and give each an `index.md` whose H1 is the menu name:

```text
lessons/
  introduction/   index.md  lesson-1-what-is-agentic-ui.md
  patterns/       index.md  lesson-1-human-in-the-loop.md  quiz-1-patterns.md
  algemeen/       index.md  lesson-1-about-this-course.md
readers/          reader-agentic-ui-glossary.md
```

```markdown
# Agentic UI patterns

Reusable solutions for approval, progress and feedback.
```

BSO does not read Docusaurus files such as `_category_.json`. Order the pages inside a folder with `sidebar_position` in the front matter. To put the reader PDFs in one of the topic folders (here `algemeen`) instead of a separate `Readers` module, add this to the course configuration:

```json
{
  "readersModule": { "slug": "algemeen", "title": "Algemeen" }
}
```

</details>
