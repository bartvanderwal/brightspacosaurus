# Contributing to Brightspacosaurus

Brightspacosaurus has two audiences: course authors using the tool and contributors extending the open-source package by fixing bugs and building new features. Keep user-facing guidance in the README and User Manual; keep implementation decisions and technical contracts in the [Software Guidebook](docs/software-guidebook.md).

## Documentation contract

Every code or behavior change should ideally also update the documentation that explains it:

- Update the README or User Manual when author-visible behavior, configuration, CLI usage or import behavior changes.
- Update the Software Guidebook when architecture, implementation boundaries, rendering contracts, accessibility behavior, data flow or external-system assumptions change.
- Update the relevant design/specification or domain model when a feature changes requirements, concepts, invariants or acceptance criteria.
- Add or update tests and durable demo-course scenarios for behavior that can regress.
- Every new behavior must include focused automated tests and keep overall line coverage at or above the repository goal of 80%; report branch and function coverage as well when coverage is measured.
- Follow the test pyramid: cover pure parsing and transformations with unit tests, build/export boundaries with integration tests, and complete user workflows with automated end-to-end tests where practical. Add a manual Brightspace import test when the real LMS is part of the behavior.
- Keep Docusaurus preview behavior aligned with the Brightspace/IMSCC output. Document any intentional difference and its reason.

## Flashcard parity

Flashcards are authored in Markdown with `:::flashcards` and `:::flashcard` containers. The Brightspace export and Docusaurus preview must use the same semantic classes and the shared published behavior asset documented in the Software Guidebook. Do not implement a second preview-only flashcard interaction.

## Validation

Before opening a pull request, run:

```sh
deno task check
deno task lint
deno task test
deno task demo
```

The demo build is a durable manual regression fixture. Import its generated `.imscc` into a Brightspace sandbox when a change affects generated HTML, links, JavaScript, assets, navigation, quizzes or PDFs.
