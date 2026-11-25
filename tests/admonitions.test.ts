import fc from "fast-check";
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { join } from "@std/path";
import {
  ADMONITION_LABELS,
  ADMONITION_TYPES,
  admonitionIssues,
  type AdmonitionNode,
  type AdmonitionsConfig,
  OTHER_DIRECTIVES,
  remarkAdmonitions,
  resolveAdmonitionsOptions,
} from "../src/admonitions.ts";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { lintMarkdown } from "../src/course-linter.ts";
import { convertMarkdown } from "../src/markdown-converter.ts";

// Spec *Admonitions*, rules AD1-AD7.

async function render(
  markdown: string,
  options?: AdmonitionsConfig,
): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkDirective)
      .use(remarkAdmonitions, options)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(markdown),
  );
}

const COLLAPSIBLE = ["note", "optional"];

Deno.test("AD1/AD2: every type becomes a block; note and optional are details, the others a div", async () => {
  for (const type of ADMONITION_TYPES) {
    const html = await render(`:::${type}\nBody text.\n:::\n`);
    const tag = COLLAPSIBLE.includes(type) ? "details" : "div";
    assertStringIncludes(
      html,
      `<${tag} class="bso-admonition bso-admonition-${type}"`,
    );
    assertStringIncludes(html, `</${tag}>`);
    assertStringIncludes(html, "<p>Body text.</p>");
    assert(!html.includes(":::"), html);
  }
});

Deno.test("AD2: a note starts open and an optional block starts closed", async () => {
  assertStringIncludes(
    await render(":::note\nx\n:::\n"),
    '<details class="bso-admonition bso-admonition-note" open>',
  );
  const optional = await render(":::optional\nx\n:::\n");
  assertStringIncludes(
    optional,
    '<details class="bso-admonition bso-admonition-optional">',
  );
  assert(!optional.includes(" open"), optional);
});

Deno.test("AD2: the title holds a decorative icon and the label, and the block has no role", async () => {
  const optional = await render(":::optional\nRead on.\n:::\n");
  assertStringIncludes(
    optional,
    '<summary class="bso-admonition-title"><span class="bso-admonition-icon" aria-hidden="true"></span>Optional</summary>',
  );
  const warning = await render(":::warning\nCareful.\n:::\n");
  assertStringIncludes(
    warning,
    '<p class="bso-admonition-title"><span class="bso-admonition-icon" aria-hidden="true"></span>Warning</p>',
  );
  assert(!optional.includes("role=") && !warning.includes("role="));
});

Deno.test("AD1: [Title] is a custom title, and it may hold inline Markdown", async () => {
  const html = await render(":::tip[Run it *twice*]\nBody.\n:::\n");
  assertStringIncludes(html, "Run it <em>twice</em></p>");
  assert(!html.includes(">Tip<"), html);
  assertStringIncludes(html, "<p>Body.</p>");
});

Deno.test("AD1: the content is ordinary Markdown: paragraphs, lists, tables, code and pictures", async () => {
  const html = await render([
    ":::optional[Extra depth]",
    "A first paragraph with **bold**, `code` and a [link](https://example.org).",
    "",
    "A second paragraph.",
    "",
    "- one",
    "- two",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "![A picture](images/picture.png)",
    ":::",
    "",
  ].join("\n"));
  for (
    const part of [
      "<strong>bold</strong>",
      "<code>code</code>",
      "<ul>",
      "<table>",
      "const x = 1;",
      '<img src="images/picture.png" alt="A picture">',
    ]
  ) assertStringIncludes(html, part);
  assertEquals(html.match(/<details/g)?.length, 1);
  assert(html.indexOf("A second paragraph") < html.indexOf("</details>"));
});

Deno.test("AD1: blocks nest when the outer one has more colons", async () => {
  const html = await render(
    "::::note\nOuter.\n\n:::warning\nInner.\n:::\n\n::::\n",
  );
  assertStringIncludes(html, "bso-admonition-note");
  assertStringIncludes(html, "bso-admonition-warning");
  assert(html.indexOf("Inner.") < html.indexOf("</details>"), html);
});

Deno.test("AD1: the blockquote form is not an admonition", async () => {
  const html = await render("> [!NOTE]\n> text\n");
  assert(!html.includes("bso-admonition"), html);
  assertStringIncludes(html, "<blockquote>");
});

Deno.test("AD1: other directives and plain text are left alone", async () => {
  const html = await render(
    ":::flashcards\ntext\n:::\n\nPlain text: with a colon.\n",
  );
  assert(!html.includes("bso-admonition"), html);
});

Deno.test("AD3: labels follow the locale, and a configured label replaces one type", async () => {
  const nl = await render(":::warning\nx\n:::\n\n:::optional\ny\n:::\n", {
    locale: "nl",
  });
  assertStringIncludes(nl, "Let op</p>");
  assertStringIncludes(nl, "Optioneel</summary>");
  const custom = await render(":::note\nx\n:::\n", {
    locale: "nl",
    labels: { note: "Extra uitleg" },
  });
  assertStringIncludes(custom, "Extra uitleg</summary>");
  for (const locale of ["nl", "en"] as const) {
    assertEquals(
      Object.keys(ADMONITION_LABELS[locale]).sort(),
      [...ADMONITION_TYPES].sort(),
    );
  }
});

Deno.test("AD3: options are validated", () => {
  assertThrows(
    () => resolveAdmonitionsOptions("x"),
    Error,
    "must be an object",
  );
  assertThrows(
    () => resolveAdmonitionsOptions({ colors: {} }),
    Error,
    "admonitions.colors",
  );
  assertThrows(
    () => resolveAdmonitionsOptions({ locale: "de" }),
    Error,
    "'nl' or 'en'",
  );
  assertThrows(
    () => resolveAdmonitionsOptions({ labels: { hint: "x" } }),
    Error,
    "admonitions.labels.hint",
  );
  assertThrows(
    () => resolveAdmonitionsOptions({ labels: { note: " " } }),
    Error,
    "non-empty",
  );
  assertEquals(
    resolveAdmonitionsOptions(undefined, "nl").labels.note,
    "Opmerking",
  );
  assertEquals(
    resolveAdmonitionsOptions({ labels: { tip: " Handig " } }).labels.tip,
    "Handig",
  );
});

Deno.test("AD3: BSO takes the locale from diagrams.locale and validates the field", () => {
  const base = { courseName: "C", version: "1", sourcesDir: "lessons" };
  assertEquals(
    resolveConfig(
      { ...base, diagrams: { locale: "en" } } as never,
      {},
      Deno.cwd(),
    )
      .admonitions?.labels.warning,
    "Warning",
  );
  assertEquals(
    resolveConfig({ ...base } as never, {}, Deno.cwd()).admonitions?.labels
      .warning,
    "Let op",
  );
  assertThrows(
    () => validateConfig({ ...base, admonitions: { labels: { hint: "x" } } }),
    Error,
    "admonitions.labels.hint",
  );
});

Deno.test("AD4: the Brightspace HTML uses the same plugin and the same stylesheet", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({ dir: "build", prefix: "admonitions-" });
  try {
    const source = join(root, "lesson.md");
    await Deno.writeTextFile(
      source,
      "# Lesson\n\n:::optional\nExtra depth.\n\nA second paragraph.\n:::\n",
    );
    const result = await convertMarkdown({
      sourcePath: source,
      outputDir: join(root, "out"),
      repoRoot: Deno.cwd(),
      baseDir: root,
      admonitions: resolveAdmonitionsOptions({ locale: "nl" }),
    });
    const html = await Deno.readTextFile(result.outputPath);
    assertStringIncludes(
      html,
      '<details class="bso-admonition bso-admonition-optional">',
    );
    assertStringIncludes(html, "Optioneel</summary>");
    assertStringIncludes(html, ".bso-admonition-optional");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

// The luminance formula of WCAG 2.2 (relative luminance, contrast ratio).
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

Deno.test("AD2/AD5: a collapsible admonition keeps its frame against the general details rule", async () => {
  const css = await Deno.readTextFile("assets/brightspacosaurus.css");
  // `.brightspace-content details` has a higher specificity than `.bso-admonition`, so the
  // frame of a note or optional block needs a rule that is at least as specific.
  for (const scope of [".brightspace-content", "article.markdown"]) {
    const rule = css.match(
      new RegExp(
        `${
          scope.replace(".", "\\.")
        } details\\.bso-admonition[,\\s{][^}]*\\{[^}]*\\}`,
      ),
    );
    assert(rule, `no frame rule for ${scope}`);
    assertStringIncludes(rule[0], "border-left-width: 6px");
  }
});

Deno.test("AD5: the colours in the stylesheet have enough contrast, and forced colours and focus are handled", async () => {
  const css = await Deno.readTextFile("assets/brightspacosaurus.css");
  const token = (name: string) => {
    const match = css.match(
      new RegExp(`--bso-adm-${name}:\\s*(#[0-9a-fA-F]{6})`),
    );
    assert(match, `token ${name} missing`);
    return match[1];
  };
  const text = token("text");
  const page = "#ffffff";
  for (const type of ADMONITION_TYPES) {
    const bg = token(`${type}-bg`);
    const line = token(`${type}-line`);
    assert(
      contrast(text, bg) >= 4.5,
      `${type}: text on background ${contrast(text, bg)}`,
    );
    assert(
      contrast(line, bg) >= 3,
      `${type}: border and icon against the block ${contrast(line, bg)}`,
    );
    assert(
      contrast(line, page) >= 3,
      `${type}: border against the page ${contrast(line, page)}`,
    );
  }
  assertStringIncludes(css, "@media (forced-colors: active)");
  assertStringIncludes(css, "summary.bso-admonition-title:focus-visible");
  for (const type of ADMONITION_TYPES) {
    // Not colour alone: every type has its own icon glyph.
    assert(
      type === "note" ||
        css.includes(`.bso-admonition-${type} .bso-admonition-icon::before`),
      `${type} has no icon`,
    );
  }
});

function lintRules(markdown: string): string[] {
  return lintMarkdown(markdown, "lesson.md")
    .filter((d) => d.rule.startsWith("admonition-"))
    .map((d) => d.rule);
}

Deno.test("AD6: a mistyped or Docusaurus-only name, an empty block and an unclosed block are warnings", () => {
  assertEquals(lintRules("# L\n\n:::optionl\ntext\n:::\n"), [
    "admonition-unknown-type",
  ]);
  assertEquals(lintRules("# L\n\n:::info\ntext\n:::\n"), [
    "admonition-unknown-type",
  ]);
  assertEquals(lintRules("# L\n\n:::danger\ntext\n:::\n"), [
    "admonition-unknown-type",
  ]);
  assertEquals(lintRules("# L\n\n:::note\n:::\n"), ["admonition-empty"]);
  assertEquals(lintRules("# L\n\n:::note[Only a title]\n:::\n"), [
    "admonition-empty",
  ]);
  assertEquals(
    lintRules("# L\n\n:::optional\ntext without a closing fence\n"),
    ["admonition-unclosed"],
  );
  assertEquals(lintRules("# L\n\n:::note\ntext\n:::\n"), []);
  assertEquals(lintRules("# L\n\n:::tip[Title]\ntext\n\nmore\n:::\n"), []);
  assertEquals(
    lintRules("# L\n\n::::note\nOuter.\n\n:::warning\nInner.\n:::\n\n::::\n"),
    [],
  );
});

Deno.test("AD6: flashcards are not reported as unknown admonitions", () => {
  assertEquals(
    lintRules(
      "# L\n\n::::flashcards\n\n:::flashcard\nterm: a\n\nb\n:::\n\n::::\n",
    ),
    [],
  );
});

Deno.test("AD7: directives in code are text", async () => {
  assertEquals(
    lintRules(
      "# L\n\n```md\n:::optionl\ntext\n:::\n```\n\nUse `:::note` here.\n",
    ),
    [],
  );
  const html = await render("```md\n:::note\nx\n:::\n```\n");
  assert(!html.includes("bso-admonition"), html);
});

Deno.test("AD6: any directive name is reported exactly when it is not an admonition or flashcard name", () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[a-z][a-z-]{0,10}$/), (name) => {
      const tree: AdmonitionNode = {
        type: "root",
        children: [{
          type: "containerDirective",
          name,
          children: [{
            type: "paragraph",
            children: [{ type: "text", value: "x" }],
          }],
        }],
      };
      const known = (ADMONITION_TYPES as readonly string[]).includes(name) ||
        OTHER_DIRECTIVES.includes(name);
      assertEquals(
        admonitionIssues(tree).some((issue) =>
          issue.rule === "admonition-unknown-type"
        ),
        !known,
      );
    }),
    { numRuns: 100 },
  );
});

Deno.test("AD2: the plugin is deterministic", async () => {
  const source = ":::caution\nSharp.\n:::\n\n:::tip[Hint]\nSoft.\n:::\n";
  assertEquals(await render(source), await render(source));
});
