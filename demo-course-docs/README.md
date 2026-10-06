# Demo Course Preview

This is the Docusaurus app that shows the demo course as a website. It holds no course content: the lessons, quizzes and readers live in [examples/demo-course](../examples/demo-course), and this app only renders them (`bso preview`, the GitHub Pages demo and the browser tests). The two are separate because the course is what BSO exports to Brightspace, while this app is only the preview shell around it. It also publishes the Software Guidebook, user manual and ADRs on GitHub Pages.

| | `examples/demo-course` | `demo-course-docs` |
| --- | --- | --- |
| Is | The demo course: Markdown source, config, readers | Docusaurus app (config, React components, Playwright tests) |
| Used for | `bso prepare` / `pack` into a `.imscc`; test set for BSO features | `bso preview`, GitHub Pages, browser regression tests |
| Contains | Lessons, quizzes, readers, `brightspacosaurus.config.json` | `docusaurus.config.js`, `src/`, `tests/`, no course content |

From the repository root:

```sh
npm ci --prefix demo-course-docs
deno task demo:preview
```

Or run `bso preview` using an installation with `--allow-run=npm` permission.

Open http://localhost:3000 and stop the server with Ctrl+C. Restart the preview
server after changes to Docusaurus configuration or plugins.

The app reads lessons, readers and linked partials from `examples/demo-course`.
When a reader PDF is present in the preview's static files, links to that reader
open the PDF directly; without the PDF, they continue to open the HTML page.
Flashcards share the remark transformation, CSS and browser behavior with the
Brightspace export. The core-concepts lesson demonstrates both explicit cards and
a plain `Core concepts` list, enabled by `flashcards.sectionHeadings` in the demo
course config. `bso preview` forwards the selected config through
`BSO_PREVIEW_FLASHCARDS_CONFIG`; direct builds fall back to the root course config.
Quiz previews share the parser, validation and quiz settings
with QTI export; `quiz.shuffleAnswers` controls randomization per attempt.
The demo enables shuffle. The default for courses that omit this setting is false.

Includes (`{@include: [text](path.md)}`) are expanded with the same shared
module as the Brightspace export. Diagram fences render through
`remark-kroki-a11y`, including its source/natural-language tabs.
Quiz previews are local practice: they do not save grades or enforce the LMS's
attempt limits. Brightspace handles those through its native quiz tool.

Browser regression tests build both Docusaurus and a standalone Brightspace
flashcard page, then test keyboard/mouse controls, navigation, no-JS fallback,
quiz scoring and answer shuffling:

```sh
npm exec --prefix demo-course-docs -- playwright install chromium
npm test --prefix demo-course-docs
```

With an existing Chrome installation, use
`BSO_BROWSER_CHANNEL=chrome npm test --prefix demo-course-docs`.
To test fixed answer order, add `BSO_PREVIEW_QUIZ_CONFIG='{"shuffleAnswers":false}'`
to the same command. Build only: `npm run build --prefix demo-course-docs`.
