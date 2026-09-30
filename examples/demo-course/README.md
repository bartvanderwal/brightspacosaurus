# Demo Course

A small two-week course that demonstrates all Brightspacosaurus features:

- A lesson page with fenced code blocks (copy-to-clipboard button and color syntax highlighting, in both the export and the Docusaurus preview).
- One course-level handbook with two weekly sections and internal lesson links for Common Cartridge/Brightspace testing.
- Seven lessons across two weeks covering code, tests, test strategy, links, includes, flashcards, diagrams, SVG assets, readers, packages and versions.
- Six quizzes (`quiz-` prefix), three per week, converted to QTI 1.2.
- A reader (`reader-` prefix) converted to PDF via pandoc, including a diagram-as-code example.
- A PlantUML class diagram (diagrams-as-code).

## Use as a test set

The demo course is also the test set for Brightspacosaurus. Each feature has a page here, so a feature that breaks during further development shows up in this course:

- **Automated:** `tests/demo-course-fixture.test.ts` checks the source structure, and the browser tests in `demo-course-docs/tests/` check the Docusaurus preview.
- **Manual:** some behaviour can only be checked manually in Docusaurus and especially in Brightspace itself, such as links, scripts and quiz import. After each release, import the generated `.imscc` and walk through the [manual import checks](#manual-import-checks) below.

Keep the Markdown sources stable: when you add a feature, add a page or section that demonstrates it. The generated `.imscc` is disposable build output.

## Try it

From this directory:

```sh
deno task demo
```

This reproducibly produces `build/brightspace/demo-course.v0.10.0.imscc`, ready to import into Brightspace. The `.imscc` postfix is the course content version from `brightspacosaurus.config.json`; the BSO version from `deno.json` appears in the version line of every page and on the teacher page.

> Diagram rendering uses Kroki. Run the build with access to the configured endpoint and pandoc/XeLaTeX for reader PDFs.

## Manual import checks

After importing `build/brightspace/demo-course.v0.10.0.imscc` into Brightspace:

1. Open the **Demo Course Handbook**. Click every lesson link in both week tables. They should open the corresponding Brightspace topics, and the content menu should highlight the opened topic; this tests issues #8 and #41. If the menu does not follow, note whether the course uses the classic content view or Lessons, and check the browser console for a failed `/d2l/api/le/.../content/toc` request.
2. Open **Lesson 1.1: FizzBuzz** and copy the Java code with the **Kopieer** button; paste it into a text field. This tests issue #16.
3. On **Lesson 1.1: FizzBuzz**, verify the PlantUML class diagram is visible as an image. This tests issue #29.
4. Open **Lesson 1.2: Test Pyramid and Test Strategy** and click the **Testing Basics** reader link. Verify that Brightspace opens the generated reader PDF.
5. Confirm generated topics show both the BSO version and the separate content version in the page badge, and that the package name carries the content version (`demo-course.v0.10.0.imscc`). This tests issues #30 and #42.
6. Confirm week 1 contains four lessons, week 2 three lessons, and each week three quizzes, with each quiz directly after its lesson (e.g. Lesson 1.1, Quiz 1.1, Lesson 1.2). BSO sorts by the `week.lesson` code in the title, so Brightspace and the Docusaurus sidebar show the same order.
7. On **Lesson 2.1**, verify PlantUML, Mermaid and the packaged SVG asset are visible.
8. On **Lesson 2.2**, open the Testing Basics PDF and inspect its cover, table of contents, includes, Mermaid diagram and PlantUML diagram.
9. On **Lesson 2.3**, inspect `imsmanifest.xml` and confirm HTML, QTI, reader PDF and SVG assets are present.
10. On **Lesson 1.4**, test all eight core-concept flashcards, including nested Markdown and keyboard interaction. This tests issue #31.

11. Open an imported quiz and confirm **Randomize answer order** is enabled (the demo sets `quiz.shuffleAnswers: true`). Take an attempt, select the known correct answer and verify its score. Repeat with `quiz.shuffleAnswers: false` in a separate test course to confirm fixed ordering.
12. Preview the same quiz in Docusaurus: answer identities and scoring stay correct after shuffling; **New attempt** resets answers. Preview feedback is local and does not store grades.

Run `deno task lint:course` from the repository root before exporting. The browser
parity tests are described in [the preview README](../../demo-course-docs/README.md).
