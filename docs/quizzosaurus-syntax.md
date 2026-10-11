# QuizDown syntax

**QuizDown** is the preferred authoring syntax for quizzes: Markdown with a small set of structure markers. **Quizzosaurus** (QZO) is the package that holds the model, the parsers, the linter and the generators. BSO uses it to build QTI for Brightspace; remark-quizzosaurus uses it for interactive quizzes in Docusaurus.

This document lives in BSO because the parser lives in BSO ([`src/quiz-parser.ts`](../src/quiz-parser.ts)). It moves along when the quiz code is extracted into the Quizzosaurus package (#11).

Decision record: [ADR 020](adr/adr020-quizdown-syntax-and-quizzosaurus-package.md).

Status: sections 2 to 6 (markers, `@` assignments, option labels, the heading form with explanations, `(2 pt)` points) and the linter in section 7 are implemented in 0.21.0. Still open: a long answer (`= ~long`), a model answer for teachers, and whether a bare `(N)` is unambiguous.

## 1. Principles

1. **Composition.** QuizDown defines only the **structure** of a quiz: question, hint, option, answer, assignment. All **text** inside that structure is ordinary Markdown. Bold, *italic*, `inline code`, fenced code blocks and diagrams (`kroki`, PlantUML, Mermaid) work in prompts, options, hints and shared assignment text. Structure markers are never recognised inside fenced code.
2. **Parity.** The QTI export and the Docusaurus preview render the same Markdown tree ([`src/quiz-markdown.ts`](../src/quiz-markdown.ts)), so output looks the same in both.
3. **Strict, not forgiving (conceptual integrity).** Every concept has one canonical spelling. QuizDown does not silently repair or reinterpret input; deviating input is an **error** with an actionable message, not a guess. A tolerant parser looks friendly, but every accepted variant becomes something that authors, other tools and later versions must keep supporting. See section 10.
4. **Several formats, one model.** The legacy format (`## Vraag N`) keeps working. Each format is a separate, strictly defined syntax, recognised by its explicit markers, and both are parsed into the same format-neutral model. Legacy gets no new features. See section 8.

## 2. Markers in a fenced `quiz` block

| Marker                     | Meaning                                            |
| -------------------------- | -------------------------------------------------- |
| `? prompt`                 | Question prompt                                    |
| `! hint`                   | Optional hint                                      |
| `- ( ) option`             | Single-choice option (radio); `(x)` is the answer  |
| `- [ ] option`             | Multiple-response option (checkbox); `[x]` is right |
| `= a / b ~maxLength`       | Open short answer: accepted answers, optional length |

The response type follows from the markers. Mixing round and square markers, or options with `=`, is invalid.

## 3. Options: labels and composition

Options may carry a label (`a.`), and may contain any Markdown, including fenced blocks and diagrams:

````markdown
? Which UML diagram belongs to the Decorator pattern?

- (x) a. Uses `wrapper` objects, see:
  ```kroki
  ...
  ```
- ( ) b. More like this, with **bold** and *italic*:
  ```kroki
  ...
  ```
````

An option may start with a label (`a.` or `b)`). A label must match the option's position (`a.` first, `b.` second, and so on); a wrong one is an error (`quizdown-option-label`), so a text such as 'I. Newton' as the first option would be read as a label. Content under an option **must** be indented by two spaces, as in GFM. A fence that is not indented is an error (`quizdown-unindented-option-content`): editors and GitHub render it as a list followed by a separate block, so the author sees something different from what the parser reads.

## 4. Where a question ends

A question has no closing marker. It ends implicitly:

- **Fenced form:** at the next `?` or `@` line at block level, or at the end of the block.
- **Heading form:** at the next heading of the **same or a higher** level, or at the end of the file. A deeper heading does not end it.

## 5. Heading form

A quiz file may use headings instead of a fence. Three kinds of headings are distinguished by an explicit marker, because a plain heading must stay a normal section:

| Heading                  | Meaning                                  |
| ------------------------ | ---------------------------------------- |
| `## Some section`        | Section (grouping, intro text); not a question |
| `## ? 2. Question text`  | Question                                 |
| `## @ Assignment 27`     | Assignment with shared context and sub-questions |

````markdown
# Quiz Design Patterns & UML

## ? 1. Which UML diagram belongs to the Decorator pattern?

- (x) a. ...
- ( ) b. ...

## Another section

## @ Assignment 27

Shared text, image, diagram or code:

```java
class FizzBuzz { ... }
```

### ? 27a. Which tests are **useful**? (2 pt)

- [x] a. `of(3)` returns `"Fizz"`
- [ ] b. `of(0)` returns `null`

### ? 27b. Name the technique. (1 pt)

= boundary value / edge case ~30
````

Nesting rules:

- A `?` heading with answer markers (options, `=`) is a **leaf question**. The heading text is the first line of the question; the text under it continues the prompt. A deeper heading *without* `?` inside a question is an **error** (`quizdown-invalid-subheading-in-question`), except one fixed section: an **explanation**, see below. BSO does not drop content silently.
- An `@` heading is an **assignment**. Its content up to the first `?` child is the shared context. Its `?` children are the sub-questions, each with its own response type and points. The assignment ends at the next heading of the same or a higher level.
- **Explanation:** a heading named `Toelichting` or `Explanation`, exactly one level below a question or sub-question, holds Markdown shown after the answer (code, images and deeper headings allowed). A question has at most one (`quizdown-duplicate-explanation`) and it must not be empty (`quizdown-explanation-empty`). QTI export writes it as a second `itemfeedback` (`<ident>_explanation`) next to the hint; the Docusaurus preview shows it after "Check". How Brightspace displays it is not verified. The explanation exists only in heading form for now; the fenced form has no marker for it.
- A `?` heading that has `?` children is an error (`quizdown-nested-question`): a question is either a leaf or an assignment. A `?` or `@` heading needs a title (`quizdown-heading-title`).
- A section heading never starts a question by itself. Without an explicit `@`, a section whose first children are questions would be indistinguishable from an assignment with shared text.

## 6. Assignments in a fenced block

`@` plays the same role as the `@` heading:

`````markdown
````quiz
@ Assignment 27
Given the class `FizzBuzz`:

```java
class FizzBuzz { String of(int n) { ... } }
```

? Which tests are **useful and working**? (2 pt)
- [x] `of(3)` returns `"Fizz"`
- [ ] `of(0)` returns `null`

? Name the technique that `of(15)` illustrates. (1 pt)
= boundary value / edge case ~30
````
`````

- All text between `@` and the first `?` is shared context. It is stored once and never copied per sub-question.
- Every `?` belongs to the nearest preceding `@`. A `?` without `@` is a standalone question, so existing quizzes do not change.
- Points go at the end of the `?` line as `(2 pt)` or `(2)`. `(2 punten)` and other spellings are a lint error. A bare `(N)` counts only at the very end of a `?` line.
- Use a fence of four or more backticks around the `quiz` block when the shared text contains a fenced block.
- Sub-questions are graded independently.

Response types per sub-question (all mixable):

| Type                | Markers                                      |
| ------------------- | -------------------------------------------- |
| Single choice       | `- ( )` options                              |
| Multiple response   | `- [ ]` options                              |
| Short open answer   | `= a / b ~maxLength`                         |
| Long open answer    | `= ~long` (manually graded) — syntax is open |

## 7. Linter

Linting is a separate module of Quizzosaurus (`quizdown-lint`), so QuizDown can be linted on its own, without BSO, by any Quizzosaurus client. It reports rules with a **severity** (`error` or `warning`). Warnings are for style; anything that makes the parser guess is an error. `QuizIssue` has no severity yet; adding one is part of #80.

`bso lint` calls this module itself, and only for files that contain QuizDown. Authors run one linter and get the Quizzosaurus rules embedded. Standard Markdown rules, such as skipped heading levels (MD001), stay with markdownlint.

Rules to add for #80: assignment without sub-questions; sub-question labels that do not ascend; invalid points spelling; unindented option content (error); a `?` heading that has `?` children; mixed formats in one file (error).

## 8. Migration: branch by abstraction

1. Both parsers produce the same format-neutral model (assignments, sub-questions, response type, points, shared text). Exports, preview and lint depend on the model only, never on the source format.
2. QuizDown is added behind that abstraction. Legacy stays and gets no new features.
3. Clients (owe-1, owe-3 and other course repos) migrate quiz by quiz. A file is detected by its markers, so legacy and QuizDown files can live side by side in one course.
4. A conversion aid (legacy to QuizDown) is optional; decide after the first migrated course.

## 9. Packaging and naming (decisions to confirm)

- One package `quizzosaurus` (npm and Deno/JSR) with model, parsers, linter; plus `remark-quizzosaurus` for Docusaurus.
- A website under the name QuizDown, for example quizdown.io, for the syntax description.
- Check before committing to names: another project called QuizDown already exists on npm, so the domain and package name must be verified first.

## Open points

- Syntax for a long answer (`= ~long` is a proposal) and for a teacher-only model answer.
- Whether `(N)` without `pt` is unambiguous enough in prompts such as "step (2)".
- Whether the shared model keeps QTI-specific fields out (it must, so an Ans export can use it later).
- Verify Section Text import in a Brightspace sandbox.

## 10. Why strict: the cost of being liberal

Postel's robustness principle says: be conservative in what you send, be liberal in what you accept. Spolsky (2008) describes what it did to the web: browsers forgave broken pages, so pages came to depend on the forgiveness, and a standards-compliant IE8 broke sites that contained workarounds for earlier IE bugs. Thomson and Schinazi (2023) generalise this: "negative consequences to interoperability accumulate over time if implementations silently accept faulty input."

QuizDown applies the lesson from the start:

- One canonical form per concept; deviations are errors, with the fix in the message.
- The format is recognised from explicit markers (a `quiz` fence, `?` and `@` headings), never guessed from content.
- A future breaking change gets an explicit version, so old quizzes keep their meaning. This is the same role the doctype and IE8's version targeting played for the web. The syntax has no version marker yet; add one (for example `quizdown: 1` in front matter) before the first incompatible change.

Strictness must not make authoring harder. The pit of success (Atwood, 2007, crediting Mariani) is the counterweight: the canonical form is the easiest to write, defaults replace configuration, and each error message names the fix.

The same principle governs BSO. Where BSO has a choice between repairing input and rejecting it, it rejects it with a useful message (see *Fail fast* in AGENTS.md). This does not conflict with "support both of two reasonable syntaxes": each syntax is strictly defined, and BSO accepts neither of them in a broken form.

## Sources

Atwood, J. (2007, August 29). *Falling into the pit of success*. Coding Horror. <https://blog.codinghorror.com/falling-into-the-pit-of-success/>

Spolsky, J. (2008, March 17). *Martian headsets*. Joel on Software. <https://www.joelonsoftware.com/2008/03/17/martian-headsets/>

Thomson, M., & Schinazi, D. (2023). *Maintaining robust protocols* (RFC 9413). Internet Architecture Board. <https://www.rfc-editor.org/rfc/rfc9413>
