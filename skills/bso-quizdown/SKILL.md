---
name: bso-quizdown
description: "Author, lint and preview BSO QuizDown quizzes with assignments, shared context, sub-questions, answer types, hints and points; validate QTI output."
---

# Author QuizDown quizzes

Use this for new or edited quiz Markdown that BSO converts to a native Brightspace assessment. Respond in the user's language and preserve the course's language/locale.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not silently upgrade.
- Required: Deno 2.0 or newer, a quiz file in the configured source directory with the `quiz-` filename prefix.
- `bso lint` and build need the course's normal read/write permissions. Docusaurus is optional for interactive preview; no student data or live grades are needed.

## Workflow

1. Read the [QuizDown syntax](https://bartvanderwal.github.io/brightspacosaurus/guidebook/quizzosaurus-syntax/) before creating structure. Use a fenced `quiz` block with its documented markers (`@` assignment, `?` question, `!` hint, answer options or `=` short answer); do not mix or guess syntax. Preserve a legacy quiz format if the author asks to maintain it.
2. For an assignment with shared context, put the shared material at assignment level and questions beneath it. A question is a leaf; use sub-questions under the assignment, not nested inside a leaf question.
3. Use only supported answer types and exact answer markers from the syntax guide. Keep hints, points, code, images and diagrams inside the appropriate Markdown content. Do not invent unsupported response types or point semantics.
4. Run `bso lint` and resolve errors. If Docusaurus is configured, run `bso preview` and inspect the quiz and feedback. Then build and inspect the generated QTI/assessment in a sandbox Brightspace course before relying on scoring or rendering.

## Validate and recover

- QuizDown is strict: a parser/linter error means fix the source structure; do not silently reinterpret malformed markers.
- Confirm assignment context, question ordering, each correct answer, hint/feedback and point value with the author.
- A local preview does not prove Brightspace QTI import or grading behavior. Sandbox-import the assessment and verify expected response scoring and feedback.
- If preview or sandbox import disagrees with the source, keep the affected quiz out of a production import and report the specific behavior; do not claim it passed.
- Do not include student responses, grades or identifiable student data in quiz examples or prompts.
