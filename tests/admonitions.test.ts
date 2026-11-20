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
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { join } from "@std/path";
import {
  ADMONITION_LABELS,
  ADMONITION_TYPES,
  admonitionIssues,
  type AdmonitionNode,
  type AdmonitionsConfig,
  parseAdmonitionMarker,
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
      .use(remarkAdmonitions, options)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(markdown),
  );
}

Deno.test("AD1: every type, in any letter case, becomes a block", async () => {
  for (const type of ADMONITION_TYPES) {
    for (
      const word of [
        type,
        type.toUpperCase(),
        type[0].toUpperCase() + type.slice(1),
      ]
    ) {
      const html = await render(`> [!${word}]\n> Body text.\n`);
      assertStringIncludes(
        html,
        `<div class="bso-admonition bso-admonition-${type}">`,
      );
      assertStringIncludes(html, "<p>Body text.</p>");
      assert(!html.includes("[!"), html);
      assert(!html.includes("<blockquote"), html);
    }
  }
});

Deno.test("AD1: text after the marker is a custom title, the rest is content", async () => {
  const html = await render(
    "> [!TIP] Run it twice\n> Body.\n\n> Second paragraph\n",
  );
  assertStringIncludes(html, "Run it twice</p>");
  assert(!html.includes(">Tip<"), html);
  assertStringIncludes(html, "<p>Body.</p>");
});

Deno.test("AD1: the marker may stand alone before the paragraphs", async () => {
  const html = await render("> [!NOTE]\n>\n> First.\n>\n> Second.\n");
  assertStringIncludes(html, "<p>First.</p>");
  assertStringIncludes(html, "<p>Second.</p>");
  assertEquals(html.match(/<p/g)?.length, 3); // title + two paragraphs
});

Deno.test("AD1: another word, a later line or a plain quote leaves the block quote alone", async () => {
  for (
    const source of [
      "> [!OPTIONL]\n> text\n",
      "> text\n> [!NOTE]\n",
      "> Just a quote.\n",
      "[!NOTE] not in a quote\n",
    ]
  ) {
    const html = await render(source);
    assert(!html.includes("bso-admonition"), source);
  }
});

Deno.test("AD1: markers inside a block quote inside a list still work", async () => {
  const html = await render("- item\n\n  > [!WARNING]\n  > Careful.\n");
  assertStringIncludes(html, "bso-admonition-warning");
});

Deno.test("AD2: the title holds a decorative icon and the label, and the block has no role", async () => {
  const html = await render("> [!IMPORTANT]\n> Read this.\n");
  assertStringIncludes(
    html,
    '<p class="bso-admonition-title"><span class="bso-admonition-icon" aria-hidden="true"></span>Important</p>',
  );
  assert(!html.includes("role="), html);
});

Deno.test("AD3: labels follow the locale, and a configured label replaces one type", async () => {
  const nl = await render("> [!WARNING]\n> x\n\n> [!OPTIONAL]\n> y\n", {
    locale: "nl",
  });
  assertStringIncludes(nl, "Let op</p>");
  assertStringIncludes(nl, "Optioneel</p>");
  const custom = await render("> [!NOTE]\n> x\n", {
    locale: "nl",
    labels: { note: "Extra uitleg" },
  });
  assertStringIncludes(custom, "Extra uitleg</p>");
  assertEquals(
    Object.keys(ADMONITION_LABELS.nl).sort(),
    [...ADMONITION_TYPES].sort(),
  );
  assertEquals(
    Object.keys(ADMONITION_LABELS.en).sort(),
    [...ADMONITION_TYPES].sort(),
  );
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
      "# Lesson\n\n> [!OPTIONAL]\n> Extra depth.\n",
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
      '<div class="bso-admonition bso-admonition-optional">',
    );
    assertStringIncludes(html, "Optioneel</p>");
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

Deno.test("AD5: the colours in the stylesheet have enough contrast, and forced colours are handled", async () => {
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
  assertStringIncludes(css, ".bso-admonition-icon");
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

Deno.test("AD6: a mistyped marker and an empty block are warnings", () => {
  assertEquals(lintRules("# L\n\n> [!OPTIONL]\n> text\n"), [
    "admonition-unknown-type",
  ]);
  assertEquals(lintRules("# L\n\n> [!NOTE]\n"), ["admonition-empty"]);
  assertEquals(lintRules("# L\n\n> [!NOTE] Only a title\n"), [
    "admonition-empty",
  ]);
  assertEquals(lintRules("# L\n\n> [!NOTE]\n> text\n"), []);
  assertEquals(lintRules("# L\n\n> [!NOTE]\n>\n> text\n"), []);
  assertEquals(lintRules("# L\n\n> A plain quote.\n"), []);
});

Deno.test("AD7: markers in code are text", async () => {
  assertEquals(
    lintRules("# L\n\n```md\n> [!OPTIONL]\n```\n\nUse `> [!NOTE]` here.\n"),
    [],
  );
  const html = await render("```md\n> [!NOTE]\n> x\n```\n");
  assert(!html.includes("bso-admonition"), html);
});

Deno.test("AD1/AD6: the marker parser and the issue finder agree on any marker word", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[A-Za-z][A-Za-z-]{0,12}$/),
      fc.stringMatching(/^[A-Za-z0-9 ]{0,20}$/),
      (word, title) => {
        const marker = parseAdmonitionMarker(`[!${word}] ${title}\nbody`);
        assert(marker);
        assertEquals(marker.word, word);
        assertEquals(marker.title, title.trim());
        const known = (ADMONITION_TYPES as readonly string[]).includes(
          word.toLowerCase(),
        );
        assertEquals(marker.type !== undefined, known);
        const tree: AdmonitionNode = {
          type: "root",
          children: [{
            type: "blockquote",
            children: [{
              type: "paragraph",
              children: [{ type: "text", value: `[!${word}] ${title}\nbody` }],
            }],
          }],
        };
        assertEquals(
          admonitionIssues(tree).some((issue) =>
            issue.rule === "admonition-unknown-type"
          ),
          !known,
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("AD2: the plugin is deterministic", async () => {
  const source = "> [!CAUTION]\n> Sharp.\n\n> [!TIP] Hint\n> Soft.\n";
  assertEquals(await render(source), await render(source));
});
