# ADR 020 — QuizDown as the preferred quiz syntax, strict by design, in a Quizzosaurus package

## Status

Proposed

## Context

Quiz sources are currently parsed from two formats in `src/quiz-parser.ts`: a legacy heading format (`## Vraag N`, options as a list, `Correct antwoord:`) and the fenced `quiz` block (`?`, `!`, `( )`, `[ ]`, `=`). The legacy format supports single and multiple response, but not open questions. Issue #80 asks for assignments with shared context (text, code, diagrams) and sub-questions that each have their own response type and points, including open questions with a long answer. Draft PR #81 implements this for the legacy format only.

The quiz code is meant to move into a separate package (task 11.5, `quizzosaurus`), used by BSO (QTI export) and by a Docusaurus plugin (interactive quizzes). The syntax is described in [`docs/quizzosaurus-syntax.md`](../quizzosaurus-syntax.md).

### Criteria

- Authors write quizzes as Markdown, without HTML tags. Markdown stays readable as plain text.
- Compositional: structure markers define the quiz, all text inside is Markdown, including nested fenced blocks and diagrams.
- Each marker keeps the meaning it has in the Markdown world: round markers are radio buttons (one answer), square markers are checkboxes (several answers), as in HTML forms and GFM task lists.
- Existing quizzes keep working while new ones migrate.
- The linter runs standalone and inside `bso lint` without making BSO users run two linters.

## Considered options

### Option A — Extend the legacy format only (draft PR #81)

**Pros:** one parser, no new syntax for existing authors.

**Cons:** the legacy format has no open questions and no mixed types per sub-question; adding them means reinventing QuizDown with headings around it.

### Option B — Tolerant parsing of many variants

Accept indented and unindented option content, several point spellings and locale-specific labels, and repair them for the author.

**Pros:** friendly at first use.

**Cons:** every accepted variant becomes a compatibility obligation. Spolsky describes how browsers that forgave broken pages led to pages that depended on the forgiveness, so that a standards-compliant IE8 broke existing sites (Spolsky, 2008). Thomson states: "Time and experience shows that negative consequences to interoperability accumulate over time if implementations apply the robustness principle." (Thomson, 2019).

### Option C — QuizDown as preferred syntax, strict, one model, legacy via adapter (chosen)

A strictly defined syntax with explicit markers, a format-neutral model, and the legacy format kept as an adapter.

**Pros:** all response types per sub-question; one canonical form per concept; exports and lint depend on the model only.

**Cons:** a second parser to maintain during the migration; name clash with another project called QuizDown (see Consequences).

## Decision

We choose Option C.

1. **QuizDown** is the name of the preferred quiz syntax, and **Quizzosaurus** (QZO) the package with model, parsers, linter and generators. A Docusaurus plugin is named `remark-quizzosaurus`.
2. **Composition:** QuizDown only defines structure. All text inside it is Markdown. Markers are line markers outside fenced code. No HTML tags are required.
3. **Markers:** `( )` for single choice, `[ ]` for multiple response, `=` for open answers, `?` for questions, `!` for hints, and `@` for assignments with shared context. Headings can carry the same markers (`## ?`, `## @`). A question ends implicitly at the next question or at a heading of the same or a higher level. Points are written `(2 pt)` or `(2)`.
4. **Strict, not forgiving (conceptual integrity):** one canonical form per concept; deviations are errors with an actionable message. Warnings are for pure style. The format is recognised by explicit markers, and a breaking change gets an explicit version.
5. **Linter:** a separate QuizDown linter module in Quizzosaurus, usable standalone. `bso lint` calls it, only for files that contain QuizDown. Issues carry a severity (`error` or `warning`).
6. **Migration by abstraction:** both parsers fill the same format-neutral model. Legacy gets no new features. Course repositories migrate quiz by quiz.

## Consequences

**Positive**

- All response types per sub-question, and a shared context stored once.
- Standalone linting for other Quizzosaurus clients, with no second linter for BSO users.
- A stricter syntax is easier to evolve than a tolerant one.

**Negative**

- Two parsers during the migration.
- The name QuizDown clashes with an existing project of the same name that uses `[ ]` for single choice. The same file can then mean different things in the two tools. The name is kept for now; availability of the package name and domain must be checked, and a distinct name remains an option. An explicit version marker reduces the risk.
- Open syntax points: long open answers, a teacher-only model answer, and whether a bare `(N)` is unambiguous.
- The import of a Section Text into Brightspace still has to be verified in a sandbox.

## References

Spolsky, J. (2008, March 17). *Martian headsets*. Joel on Software. <https://www.joelonsoftware.com/2008/03/17/martian-headsets/>

Thomson, M. (2019). *The harmful consequences of the robustness principle* (Internet-Draft draft-iab-protocol-maintenance-04). IETF. <https://datatracker.ietf.org/doc/html/draft-iab-protocol-maintenance-04>
