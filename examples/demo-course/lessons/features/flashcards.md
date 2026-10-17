---
sidebar_position: 1
---

# Flashcards

Flashcards let a student practise recalling a definition before revealing it. Click a term to show its definition. Without JavaScript the definitions stay a readable list. Flashcards are practice support, not a graded quiz.

## Short definitions

The short variant: a list under the heading *Core concepts*. Each term and its short definition share one line, and only the definition is hidden, so a long glossary stays compact.

### Core concepts

- **module:** a main menu item in Brightspace, made from a first-level folder in `sourcesDir`.
- **reader:** reference material written in Markdown and delivered as a PDF.
- **build directory:** the folder where BSO writes all output, never next to the sources.
- **manifest:** the file `imsmanifest.xml` that tells Brightspace what the package contains.

### Set up the short variant

<details>
<summary>How to set up the short variant</summary>

Write a `**term:** definition` bullet list under a heading from `flashcards.sectionHeadings`. The heading `Core concepts` works without any configuration. To recognise other headings, add them to the course configuration:

```json
{
  "flashcards": {
    "sectionHeadings": ["Core concepts", "Kernbegrippen"]
  }
}
```

The setting applies to the whole course, so one page can hold both variants. A section may only contain complete term/definition bullets; `bso lint` warns about anything else.

</details>

## Long definitions

The long variant: explicit cards for definitions with more than one line, such as lists or several paragraphs.

::::flashcards

:::flashcard
term: Common Cartridge

An **IMS Common Cartridge** (`.imscc`) is a zip archive that Brightspace imports. It holds:

- the lesson pages as HTML,
- the quizzes as QTI,
- the reader PDFs and images.

BSO builds it from your Markdown, so the repository stays the single source of truth.
:::

:::flashcard
term: Idempotent

A command is **idempotent** when running it again on the same input gives the same output.

BSO builds are idempotent, so a repeated build does not change the package.
:::

::::

<details>
<summary>How to set up the long variant</summary>

Use a `flashcards` container with one `flashcard` container per concept. The outer container uses **four colons**, each card three. The `term:` line is the front of the card; everything below it is the definition in Markdown. No configuration is needed.

````markdown
::::flashcards

:::flashcard
term: Idempotent

A command is **idempotent** when running it again gives the same output.
:::

::::
````

</details>
