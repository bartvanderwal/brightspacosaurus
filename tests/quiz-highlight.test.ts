/**
 * Tests for syntax highlighting in quiz questions (#103).
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { generateQtiXml, parseQuizMarkdown } from "../src/quiz-converter.ts";
import {
  QUIZ_CODE_BLOCK_STYLE,
  QUIZ_INLINE_CODE_STYLE,
  QUIZ_TOKEN_STYLES,
} from "../src/quiz-highlight.ts";

function qti(markdown: string): string {
  return generateQtiXml(parseQuizMarkdown(markdown), "quiz-highlight");
}

Deno.test("quiz highlight: code in a question gets inline token colors", () => {
  const xml = qti(`# Quiz

## Question 1
What does this do?
\`\`\`js
const x = "a"; // note
\`\`\`
- A. One
- B. Two
Correct answer: **A**
`);
  assertStringIncludes(xml, "token keyword");
  assertStringIncludes(xml, "color:#c792ea");
  assertStringIncludes(xml, "color:#c3e88d");
  assertEquals(xml.includes("<style"), false);
});

Deno.test("quiz highlight: code in an answer option is highlighted", () => {
  const xml = qti(`# Quiz

\`\`\`\`quiz
? Which is valid?
- (x) This one:
  \`\`\`js
  const y = 1;
  \`\`\`
- ( ) Nothing
\`\`\`\`
`);
  assertStringIncludes(xml, "color:#c792ea");
});

Deno.test("quiz highlight: unknown language and no language stay plain", () => {
  const xml = qti(`# Quiz

## Question 1
Plain?
\`\`\`nonexistentlang
foo bar
\`\`\`
\`\`\`
baz
\`\`\`
- A. Yes
- B. No
Correct answer: **A**
`);
  assertStringIncludes(xml, "foo bar");
  assertEquals(xml.includes("class=&quot;token"), false);
});

Deno.test("quiz highlight: output is deterministic", () => {
  const md =
    "# Quiz\n\n## Question 1\n```ts\nlet a: number = 1;\n```\n- A. x\n- B. y\nCorrect answer: **A**\n";
  assertEquals(qti(md), qti(md));
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

Deno.test("quiz highlight: every token color meets WCAG AA on the code block", () => {
  const bg = luminance("#292d3e");
  for (const [name, style] of QUIZ_TOKEN_STYLES) {
    const fg = luminance(style.match(/color:(#[0-9a-f]{6})/)![1]);
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    assertEquals(ratio >= 4.5, true, `token ${name}: ${ratio.toFixed(2)}`);
  }
});

Deno.test("quiz highlight: code block is dark with a border, inline code is grey", () => {
  const xml = qti(`# Quiz

## Question 1
Use \`useEffect\` here:
\`\`\`js
let a = 1;
\`\`\`
- A. Plain \`x\`
- B. No
Correct answer: **A**
`);
  const html = xml.replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"').replaceAll("&apos;", "'");
  assertStringIncludes(
    html,
    `<pre class="language-js" style="${QUIZ_CODE_BLOCK_STYLE}">`,
  );
  assertStringIncludes(
    html,
    `<code style="${QUIZ_INLINE_CODE_STYLE}">useEffect</code>`,
  );
  assertStringIncludes(
    html,
    `<code style="${QUIZ_INLINE_CODE_STYLE}">x</code>`,
  );
  // The code inside the block is not styled as inline code.
  assertEquals(
    html.includes(`<code class="language-js code-highlight" style=`),
    false,
  );
});
