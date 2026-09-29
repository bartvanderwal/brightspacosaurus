import fc from "fast-check";
import {
  loadConfig,
  resolveConfig,
  resolveFromCliOnly,
  validateConfig,
} from "../src/config-loader.ts";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import {
  type FlashcardNode,
  type FlashcardsConfig,
  remarkFlashcards,
  resolveFlashcardsOptions,
} from "../src/flashcards.ts";
import { convertMarkdown } from "../src/markdown-converter.ts";
import { resolve } from "@std/path";

async function render(
  markdown: string,
  options?: FlashcardsConfig,
): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkDirective)
      .use(remarkFlashcards, options)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(markdown),
  );
}

Deno.test("shared flashcard renderer preserves eight demo cards and matches the exported markup", async () => {
  const sourcePath = resolve(
    "examples/demo-course/lessons/week-1/lesson-4-core-concepts.md",
  );
  const source = await Deno.readTextFile(sourcePath);
  const html = await render(source);
  assertEquals((html.match(/class="bso-flashcard"/g) ?? []).length, 8);
  assertStringIncludes(html, "<strong>unit test</strong>");
  assertStringIncludes(html, "<em>in isolation</em>");
  assertEquals(html.includes("term: Unit test"), false);
  assertEquals(html.includes(" hidden"), false);
  assertEquals(await render(source), html);

  const outputDir = await Deno.makeTempDir();
  try {
    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: Deno.cwd(),
    });
    const exported = await Deno.readTextFile(result.outputPath);
    const section = (text: string) =>
      text.match(/<section class="bso-flashcards">[\s\S]*?<\/section>/)?.[0];
    assertEquals(section(exported), section(html));
    assertStringIncludes(exported, "initializeFlashcards(document)");
  } finally {
    await Deno.remove(outputDir, { recursive: true });
  }
});

Deno.test("flashcard terms are escaped and definitions keep nested Markdown", async () => {
  const html = await render(`::::flashcards

:::flashcard
term: A & B <img src=x onerror=alert(1)>

First paragraph with **bold** and \`code\`.

- A list
- With _emphasis_

Last paragraph.
:::

::::
`);
  assertStringIncludes(html, "A &#x26; B &#x3C;img src=x onerror=alert(1)>");
  assertEquals(html.includes("<img"), false);
  assertStringIncludes(html, "<strong>bold</strong>");
  assertStringIncludes(html, "<code>code</code>");
  assertStringIncludes(html, "<ul>");
  assertStringIncludes(html, "<em>emphasis</em>");
  assertStringIncludes(html, "<p>Last paragraph.</p>");
  assertStringIncludes(html, 'aria-expanded="true"');
});

Deno.test("incomplete flashcards preserve their content without creating empty controls", async () => {
  for (const content of ["Missing a term", "term:"]) {
    const html = await render(`:::flashcard\n${content}\n\nDefinition.\n:::`);
    assertStringIncludes(html, content);
    assertStringIncludes(html, "Definition.");
    assertEquals(html.includes("<button"), false);
  }
  assertEquals(
    await render("Ordinary **Markdown**."),
    "<p>Ordinary <strong>Markdown</strong>.</p>",
  );
});

const glossaryOptions = { sectionHeadings: ["Kernbegrippen", "Glossary"] };
const cardCount = (html: string) =>
  (html.match(/class="bso-flashcard"/g) ?? []).length;

Deno.test("heading lists preserve formatted definitions and only split the first colon", async () => {
  const html = await render(
    `## Kernbegrippen

- **request:** A **client** sends a request: see [docs](https://example.org).
- **response**: Use _emphasis_ and \`200\`.
- plain: First paragraph.

  Second paragraph.

  - nested definition
- **whole: bold definition**
`,
    glossaryOptions,
  );
  assertEquals(cardCount(html), 4);
  assertStringIncludes(html, 'class="bso-flashcard-term">request</span>');
  assertStringIncludes(
    html,
    '<p>A <strong>client</strong> sends a request: see <a href="https://example.org">docs</a>.</p>',
  );
  assertStringIncludes(html, "<em>emphasis</em> and <code>200</code>");
  assertStringIncludes(html, "<p>Second paragraph.</p>");
  assertStringIncludes(html, "<li>nested definition</li>");
  assertStringIncludes(html, "<strong>bold definition</strong>");
});

Deno.test("heading recognition is opt-in, case-insensitive and ends at the same or higher level", async () => {
  const source = `- outside: ordinary

## **KERNBEGRIPPEN**

A paragraph remains visible.

- request: first card

### Details

- response: second card

## Other

- outside: ordinary

### Glossary

- contract: third card

# End

- outside: ordinary
`;
  assertEquals(cardCount(await render(source)), 0);
  assertEquals(cardCount(await render(source, { sectionHeadings: [] })), 0);
  const html = await render(source, glossaryOptions);
  assertEquals(cardCount(html), 3);
  assertEquals((html.match(/<li>outside: ordinary<\/li>/g) ?? []).length, 3);
  assertStringIncludes(html, "<p>A paragraph remains visible.</p>");
});

Deno.test("invalid and numbered lists are preserved in full", async () => {
  for (
    const list of [
      "- valid: Definition\n- no separator",
      "- : no term",
      "- [ ] term: task",
      "- term:   ",
      "1. term: numbered step",
      "- > quote: not a paragraph",
      "- valid: Definition\n- missing:",
    ]
  ) {
    const source = `## Kernbegrippen\n\n${list}`;
    assertEquals(await render(source, glossaryOptions), await render(source));
  }
});

Deno.test("compact lists work in explicit containers without configured headings", async () => {
  const html = await render(
    ":::flashcards\n\n- **request:** Message.\n- response: Reply.\n\n:::",
  );
  assertEquals(cardCount(html), 2);
  assertEquals((html.match(/class="bso-flashcards"/g) ?? []).length, 1);
});

Deno.test("demo heading cards match configured export and remain readable without scripts", async () => {
  const sourcePath = resolve(
    "examples/demo-course/lessons/week-1/lesson-4-core-concepts.md",
  );
  const source = await Deno.readTextFile(sourcePath);
  const config = resolveConfig(
    await loadConfig(resolve("brightspacosaurus.config.json")),
    {},
    Deno.cwd(),
  );
  const html = await render(source, config.flashcards);
  assertEquals(cardCount(html), 16);
  assertEquals(html.includes(" hidden"), false);
  const outputDir = await Deno.makeTempDir();
  try {
    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: Deno.cwd(),
      flashcards: config.flashcards,
    });
    const exported = await Deno.readTextFile(result.outputPath);
    const sections = (text: string) =>
      text.match(/<section class="bso-flashcards">[\s\S]*?<\/section>/g);
    assertEquals(sections(exported), sections(html));
  } finally {
    await Deno.remove(outputDir, { recursive: true });
  }
});

Deno.test("flashcard config validates options and resolves defaults without shared arrays", () => {
  const base = { courseName: "Test", version: "1", sourcesDir: "lessons" };
  assertEquals(resolveConfig(base, {}, Deno.cwd()).flashcards, {
    sectionHeadings: [],
  });
  assertEquals(
    resolveFromCliOnly({ sources: "lessons" }, Deno.cwd()).flashcards,
    { sectionHeadings: [] },
  );
  assertEquals(resolveFlashcardsOptions({}), { sectionHeadings: [] });
  const options = { sectionHeadings: [" Kernbegrippen "] };
  assertEquals(validateConfig({ ...base, flashcards: options }), true);
  const resolved = resolveFlashcardsOptions(options);
  assertEquals(resolved.sectionHeadings, ["Kernbegrippen"]);
  resolved.sectionHeadings!.push("Other");
  assertEquals(options.sectionHeadings, [" Kernbegrippen "]);
  for (
    const value of [
      null,
      [],
      true,
      "Kernbegrippen",
      { headings: [] },
      { sectionHeadings: "Kernbegrippen" },
      { sectionHeadings: [""] },
      { sectionHeadings: ["  "] },
      { sectionHeadings: [1] },
    ]
  ) {
    assertThrows(
      () => validateConfig({ ...base, flashcards: value }),
      Error,
      "flashcards",
    );
  }
});

Deno.test("property: glossary conversion preserves terms and definitions deterministically", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          term: fc.stringMatching(/^[a-z]{1,20}$/),
          definition: fc.stringMatching(/^[a-z ]{1,50}$/).filter((s) =>
            s.trim().length > 0
          ),
        }),
        { minLength: 1, maxLength: 12 },
      ),
      async (items) => {
        const source = `## Kernbegrippen\n\n${
          items.map(({ term, definition }) =>
            `- **${term}:** ${definition.trim()}`
          ).join("\n")
        }`;
        const html = await render(source, glossaryOptions);
        assertEquals(cardCount(html), items.length);
        for (const { term, definition } of items) {
          assertStringIncludes(
            html,
            `class="bso-flashcard-term">${term}</span>`,
          );
          assertStringIncludes(html, `<p>${definition.trim()}</p>`);
        }
        assertEquals(await render(source, glossaryOptions), html);
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("heading aliases recognize each configured spelling", async () => {
  const options = {
    sectionHeadings: ["Kernbegrippen", "Kern begrippen", "kern concepten"],
  };
  for (const heading of options.sectionHeadings) {
    assertEquals(
      cardCount(await render(`## ${heading}\n\n- request: Bericht.`, options)),
      1,
    );
  }
  assertEquals(
    cardCount(await render("## Core concepts\n\n- request: Message.", options)),
    0,
  );
});

Deno.test("transformation keeps leaf node shape valid for MDX and is idempotent", () => {
  const tree = unified().use(remarkParse).parse(
    "## Kernbegrippen\n\n- term: Definition.",
  ) as unknown as FlashcardNode;
  const transform = remarkFlashcards(glossaryOptions);
  transform(tree);
  const once = structuredClone(tree);
  const visit = (node: FlashcardNode) => {
    if ("children" in node) {
      assertEquals(Array.isArray(node.children), true);
      node.children!.forEach(visit);
    }
  };
  visit(tree);
  transform(tree);
  assertEquals(tree, once);
});
