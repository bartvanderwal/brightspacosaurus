# ADR 011 — Rich content in quiz questions: HTML in QTI mattext

## Status

Accepted

## Context

Brightspacosaurus generates QTI 1.2 XML for import into Brightspace. In the source files (quiz Markdown), quiz questions and answer options regularly contain rich content: inline code (backtick notation), bold, italics, and references to technical terms that should be shown in monospace.

Examples from the existing quiz files in `6.3.Studentenmateriaal/` of the original course repository:

- `` `pom.xml` ``, `` `@Autowired` ``, `` `mvn compile` `` (week 2, Maven quiz)
- `` `querySelector(...)` ``, `` `querySelectorAll(...)` `` (week 5, DOM quiz)
- `` `findBy...` ``, `` `waitFor(...)` ``, `` `apiClient` `` (week 6, React testing quiz)
- `` `MSW` ``, `` `Y-statement` `` (week 6, test strategy quiz)

None of the current quiz files contains fenced code blocks (multi-line code) or images. Inline code, however, already appears in almost every quiz series from week 2 onwards.

The existing hand-made QTI XML (e.g. `quiz-2.2-di-qti.xml`) uses `texttype="text/html"` in `mattext` elements, but converts the Markdown sources to plain text: backticks are stripped without an HTML equivalent. As a result, technical terms such as `` `@Autowired` `` appear in Brightspace as ordinary text, without monospace formatting.

### What Brightspace accepts in QTI mattext

The QTI 1.2 information model defines the `texttype` attribute of `<mattext>` as "The type of text to be displayed.", in MIME format, with "Default set as "text/plain"." (IMS Global Learning Consortium, 2002). `text/html` is therefore a valid value. Brightspace renders the HTML content of these fields. The existing reference exports confirm this: all question and answer texts are already stored as HTML-escaped HTML.

HTML elements supported in Brightspace QTI content:

| Element | Use | Status |
|---|---|---|
| `<strong>` | Bold | Supported |
| `<em>` | Italics | Supported |
| `<code>` | Inline code (monospace) | Supported |
| `<pre><code>` | Code block (multiple lines) | Supported |
| `<img src="...">` | Image (path relative to the QTI file) | Supported; the image must be in the IMSCC package |
| Inline SVG | Vector diagram | Probably stripped by the Brightspace HTML sanitizer; not recommended |

For diagrams (Mermaid, PlantUML) the recommended approach is to pre-render them to a PNG or SVG file, bundle it in the IMSCC package, and reference it through `<img src="...">`.

### Criteria

- Inline code in quiz questions must be shown in monospace in Brightspace
- The unified pipeline (remark → rehype) can convert Markdown in question and answer texts to HTML
- QTI `mattext` with `texttype="text/html"` supports HTML content in Brightspace
- Future quiz questions may contain code blocks or diagrams

## Considered options

### Option A — Plain text (existing situation)

Keep converting question and answer texts to plain text, as the hand-made QTI files do.

**Pros:** simple; no dependence on how Brightspace sanitizes HTML.

**Cons:** technical terms lose their monospace formatting; code blocks and images are impossible.

### Option B — HTML through the unified pipeline (chosen)

Convert question and answer texts to HTML with the same unified pipeline as lesson pages, and place the result in `<mattext texttype="text/html">`.

**Pros:** correct formatting; one pipeline for lessons and quizzes; room for code blocks and images.

**Cons:** the quiz converter depends on the Markdown pipeline; Brightspace's sanitizer determines what survives.

## Decision

Brightspacosaurus converts the text of quiz questions and answer options to HTML through the unified pipeline (remark → rehype → rehype-stringify) before placing it as HTML-escaped content in `<mattext texttype="text/html">`.

This means:

- Inline code (`` `code` ``) → `<code>code</code>` → shown correctly as monospace in Brightspace
- Bold (`**text**`) → `<strong>text</strong>`
- Italics (`*text*`) → `<em>text</em>`
- Fenced code blocks (` ```java ... ``` `) → `<pre><code class="language-java">...</code></pre>`
- Images (`![alt](path.png)`) → `<img src="path.png" alt="alt">` + bundle the image in the IMSCC

The HTML content is stored HTML-escaped in the XML, in line with the existing reference exports.

### Current versus desired situation

The existing hand-made QTI files convert Markdown to plain text. Brightspacosaurus improves on this by using the unified pipeline for question and answer texts, so technical terms are shown correctly in monospace.

### Limitations

- Inline SVG is probably stripped by Brightspace. Diagrams must be bundled as PNG/SVG files and referenced through `<img>`.
- Brightspace's HTML sanitizer may remove some HTML elements or attributes. When in doubt: test in a Brightspace test environment (see task 13 in the implementation plan).
- Syntax highlighting of code blocks (through CSS classes) only works if Brightspace loads the corresponding CSS. Brightspace does not load external stylesheets from the IMSCC package for QTI content. Code blocks are readable but not highlighted.

## Consequences

Positive:

- Technical terms in quiz questions are shown correctly in monospace.
- The unified pipeline is used consistently for both lesson content and quiz content.
- Future extensions (code blocks, diagrams) are possible without an architecture change.

Negative:

- The quiz converter must call the unified pipeline for question and answer texts, not only for the structure.
- Syntax highlighting of code blocks is not available in Brightspace QTI content.

## References

- D2L. (n.d.). *Import, export, or copy course components*. Brightspace Community. Retrieved September 30, 2026, from https://community.d2l.com/brightspace/kb/articles/16771-import-export-or-copy-course-components
  - Describes the import of course packages, including quizzes: "From the Import Course Package dialog, select Upload and choose your file." The existing reference exports in the original course repository (e.g. `quiz-2.2-di-qti.xml`) were imported successfully and confirm that `texttype="text/html"` is supported in practice.
- IMS Global Learning Consortium. (2002). *IMS Question & Test Interoperability: ASI information model specification* (Version 1.2). Retrieved September 30, 2026, from https://www.imsglobal.org/question/qtiv1p2/imsqti_asi_infov1p2.html
