# What Brightspacosaurus does

Brightspacosaurus (BSO) turns Markdown course material into a Brightspace Common Cartridge (`.imscc`) package. This demo course shows every feature. Each section below says what it does, links to the page where you can see it, and shows the minimal setting to turn it on; the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/) has the full reference.

## Course material as Markdown

Write lessons, quizzes and readers as Markdown files in Git: versionable, diffable and friendly to AI-assisted editors, with no lock-in to Brightspace's editor. BSO builds the Brightspace package from the same files every time, so the repository stays the single source of truth.

See it in the demo: [Demo Course Handbook](README.md).

Turn it on: a `brightspacosaurus.config.json` with three required fields, then `bso prepare` and `bso pack`.

```json
{ "courseName": "My course", "version": "1.0.0", "sourcesDir": "lessons/" }
```

## Native quizzes

Quiz files (`quiz-` prefix) become QTI 1.2 assessments that Brightspace imports as real, scored quizzes, not as static pages. Inline code and formatting in questions and answers are kept.

See it in the demo: [Quiz 1.1: FizzBuzz](week-1/quiz-1-fizzbuzz.md).

Turn it on: name the file `quiz-….md`. Optional settings: `"quiz": { "maxAttempts": 0, "shuffleAnswers": true }`. More in the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#7-quizzes-and-qti).

## Diagrams-as-code

PlantUML and Mermaid code blocks render to images via Kroki during the build. Each diagram gets an accessible name, a generated text description and its source behind a native disclosure, so the diagram stays usable with a screen reader and without JavaScript.

See it in the demo: [Lesson 2.1: Diagrams and SVG](week-2/lesson-1-diagrams-and-svg.md).

Turn it on: write a ` ```plantuml ` or ` ```mermaid ` code block. Optional: your own Kroki server with `"diagrams": { "krokiUrl": "http://localhost:8000" }`. More in the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#55-plantuml-and-mermaid-diagrams-in-lesson-pages).

## Docusaurus preview

`bso preview` starts a live, hot-reloading Docusaurus site from the same Markdown, so you can check formatting, links, code blocks, diagrams and quizzes before importing anything into Brightspace. This online demo is such a preview.

See it in the demo: you are looking at it.

Turn it on: `"docusaurusDir": "my-docusaurus-site"` in the configuration, then `bso preview`.

## Student progress from GitLab (Voortgangsverkenner)

For courses where students work in their own GitLab repositories. A tab on the teacher page fetches the status from GitLab: per student and repository the work items (issues), the commits and merge requests linked to them, and the students' comments. It summarises them as a green, orange or red stoplight and links straight to the commit, merge request or work item. It runs in the teacher's browser with a read-only GitLab token: no server, and no student data stored.

See it in the demo: [For teachers](for-teachers.md), tab *Voortgangsverkenner*. The demo points to a fictitious GitLab server, so it loads but cannot fetch data.

Turn it on: a `teacherDashboard` block in the configuration and `{@bso-teacher-dashboard}` on its own line in the teacher page. Each teacher creates a read-only GitLab token. More in the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#48-teacher-progress-dashboard-voortgangsverkenner).

```json
"teacherDashboard": {
  "gitlabUrl": "https://gitlab.example.org",
  "groupPath": "my-course-2026",
  "subgroups": ["class-a", "class-b"],
  "repos": [{ "prefix": "n1-assignment", "label": "N1 Assignment" }]
}
```

## Reader PDFs

Readers (`reader-` prefix) become downloadable PDFs via pandoc, with a separate cover page: title, version, an optional cover image and an institution logo.

See it in the demo: the reader [Testing basics](../readers/reader-testing-basics.md) starts with a link to its PDF, and [Lesson 2.2: Readers and PDF](week-2/lesson-2-readers-and-pdf.md) explains how readers work.

Turn it on: put `reader-….md` files in `"readersDir": "readers/"`; optional `"readerCoverLogo": "shared/logo.png"`. Needs pandoc. More in the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#8-readers-reference-material-as-pdf).

## Flashcards for core concepts

Term/definition lists under a configured heading, such as "Core concepts", become interactive flashcards in Brightspace and in the preview. Without JavaScript they stay a readable list.

See it in the demo: [Lesson 1.4: Core concepts flashcards](week-1/lesson-4-core-concepts.md).

Turn it on: `"flashcards": { "sectionHeadings": ["Core concepts"] }` and a `term: definition` list under that heading. More in the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#44-core-concept-flashcards).

## Teacher-only page

One page in the course for teachers, hidden from students after import. BSO fills in which version of the course material and which BSO version were used for the package, so after an import you see at a glance whether Brightspace shows the current material. The page also hosts the Voortgangsverkenner.

See it in the demo: [For teachers](for-teachers.md).

Turn it on: create `for-teachers.md` (or set `"teacherPage"`) and put `{@bso-versions}` where the version table should go. More in the [user manual](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#47-teacher-page).

## Code blocks with a copy button

Code blocks get syntax highlighting at build time (Prism, the same token classes as the Docusaurus preview) and a one-click copy button in Brightspace.

See it in the demo: [Lesson 1.1: FizzBuzz](week-1/lesson-1-fizzbuzz.md).

Turn it on: nothing to configure; every fenced code block with a language gets it.

## `bso lint`

Checks BSO-specific authoring rules before you export: include syntax, diagram sources and quiz answers.

Turn it on: run `bso lint` in the course repository.

See it in the user manual: [Linting course material](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#45-linting-course-material).

## Configurable menu order

The Brightspace menu follows your folders and `sidebar_position` in the front matter, as the Docusaurus sidebar does. Readers can get their own module or join a general one (`readersModule`). Links between lesson pages keep the Brightspace menu in sync.

Turn it on: `sidebar_position: 2` in a page's front matter, and for readers `"readersModule": { "slug": "general", "title": "General" }`.

See it in the user manual: [Menu module and order](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#82-menu-module-and-order).
