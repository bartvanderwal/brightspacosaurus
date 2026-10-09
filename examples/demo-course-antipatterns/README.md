# Antipatterns course

This is a deliberately wrong course that triggers every `bso lint` rule exactly once. It is a test fixture for the linter, not a course to import or show to students. The clean counterpart is the [demo course](../demo-course).

This intentionally invalid course is a regression fixture. Each lesson triggers exactly one diagnostic, and each rule occurs in exactly one lesson. Do not publish this course to students.

Run `bso lint` in this folder: it uses the configuration of the current directory, so here it checks this course (36 Markdown files, 25 errors, 11 warnings; exit 1 is expected) and in `examples/demo-course` it checks the clean course (0 errors, 0 warnings).

```sh
cd examples/demo-course-antipatterns
bso lint
bso lint --sources lessons/diagrams  # 5 errors, 0 warnings; exit 1 (expected)
```

Before a new version is published, use the checkout instead of the installed `bso`. From the repository root, once:

```sh
deno install -A -g -f -n bso-local --config deno.json src/main.ts
```

Then run `bso-local lint` in this folder. The output starts with the directories and file counts it scanned.

`lint.includeDirs` selects one or more folders recursively instead of the default source/reader folders. For example:

```json
{
  "lint": {
    "includeDirs": ["lessons/flashcards", "lessons/diagrams"]
  }
}
```

`--sources` overrides that selection with a single directory. Included Markdown files are still followed as dependencies, including those outside the selected folders but inside the project root.

The automated tests compare emitted diagnostics with `expected-rules.json` and require one diagnostic per file, with no duplicates or unexpected diagnostics. When adding a linter rule, add its focused lesson here and update that manifest. Tests also require the ordinary demo course to remain free of diagnostics.

## Diagnostic catalogue

| Rule | Severity | Lesson |
| --- | --- | --- |
| `flashcard-container` | error | [flashcard-container.md](lessons/flashcards/flashcard-container.md) |
| `flashcard-fence-nesting` | error | [flashcard-fence-nesting.md](lessons/flashcards/flashcard-fence-nesting.md) |
| `flashcard-unclosed` | error | [flashcard-unclosed.md](lessons/flashcards/flashcard-unclosed.md) |
| `flashcard-outside-set` | error | [flashcard-outside-set.md](lessons/flashcards/flashcard-outside-set.md) |
| `flashcard-term` | error | [flashcard-term.md](lessons/flashcards/flashcard-term.md) |
| `flashcard-definition` | warning | [flashcard-definition.md](lessons/flashcards/flashcard-definition.md) |
| `flashcard-empty-set` | warning | [flashcard-empty-set.md](lessons/flashcards/flashcard-empty-set.md) |
| `flashcard-section-content` | warning | [flashcard-section-content.md](lessons/flashcards/flashcard-section-content.md) |
| `include-syntax` | error | [include-syntax.md](lessons/includes/include-syntax.md) |
| `include-path` | error | [include-path.md](lessons/includes/include-path.md) |
| `include-cycle` | error | [include-cycle.md](lessons/includes/include-cycle.md) |
| `include-missing` | error | [include-missing.md](lessons/includes/include-missing.md) |
| `diagram-unsupported-language` | error | [diagram-unsupported-language.md](lessons/diagrams/diagram-unsupported-language.md) |
| `diagram-empty-diagram` | error | [diagram-empty-diagram.md](lessons/diagrams/diagram-empty-diagram.md) |
| `diagram-unknown-fence-option` | error | [diagram-unknown-fence-option.md](lessons/diagrams/diagram-unknown-fence-option.md) |
| `diagram-invalid-src` | error | [diagram-invalid-src.md](lessons/diagrams/diagram-invalid-src.md) |
| `diagram-invalid-option-value` | error | [diagram-invalid-option-value.md](lessons/diagrams/diagram-invalid-option-value.md) |
| `quiz-no-questions` | error | [quiz-no-questions.md](lessons/quizzes/quiz-no-questions.md) |
| `quiz-question-number` | error | [quiz-question-number.md](lessons/quizzes/quiz-question-number.md) |
| `quiz-prompt` | error | [quiz-prompt.md](lessons/quizzes/quiz-prompt.md) |
| `quiz-options` | error | [quiz-options.md](lessons/quizzes/quiz-options.md) |
| `quiz-option-label` | error | [quiz-option-label.md](lessons/quizzes/quiz-option-label.md) |
| `quiz-option-text` | error | [quiz-option-text.md](lessons/quizzes/quiz-option-text.md) |
| `quiz-answer` | error | [quiz-answer.md](lessons/quizzes/quiz-answer.md) |
| `quiz-duplicate-answer` | error | [quiz-duplicate-answer.md](lessons/quizzes/quiz-duplicate-answer.md) |
| `quiz-answer-syntax` | error | [quiz-answer-syntax.md](lessons/quizzes/quiz-answer-syntax.md) |
| `quiz-option-syntax` | error | [quiz-option-syntax.md](lessons/quizzes/quiz-option-syntax.md) |
| `hard-wrapped-lines` | warning | [hard-wrapped-lines.md](lessons/metadata/hard-wrapped-lines.md) |
| `lesson-frontmatter` | warning | [lesson-frontmatter.md](lessons/metadata/lesson-frontmatter.md) |
| `metadata-fields-one-line` | warning | [metadata-fields-one-line.md](lessons/metadata/metadata-fields-one-line.md) |
