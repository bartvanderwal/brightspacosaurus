import { assertEquals, assertStringIncludes } from "@std/assert";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { remarkFlashcards } from "../src/flashcards.ts";
import { convertMarkdown } from "../src/markdown-converter.ts";
import { resolve } from "@std/path";

async function render(markdown: string): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkFlashcards)
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
