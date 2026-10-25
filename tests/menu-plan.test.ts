import { assertEquals, assertThrows } from "@std/assert";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { join, resolve } from "@std/path";
import { isLeadPageName, overviewLinks, planMenu } from "../src/menu-plan.ts";

// Spec *Menu order*, rules O1-O10.

const headings = ["Overview", "Overzicht"];

Deno.test("O1/O2: the overview lists the links of its section in order and ignores other sections, code and external links", () => {
  const markdown = [
    "# Week 1",
    "",
    "## Intro",
    "- [Not listed](x.md)",
    "",
    "## 1. Overzicht",
    "",
    "- [Lesson one](lesson-1.md)",
    "1. [Quiz](quiz-1.md#top)",
    "- [External](https://example.org/a.md) and [Lesson two](./lesson%202.md)",
    "",
    "```md",
    "- [Code](code.md)",
    "```",
    "",
    "### Sub heading stays inside",
    "- [Deeper](deeper.md)",
    "",
    "## Next",
    "- [After](after.md)",
  ].join("\n");
  assertEquals(
    overviewLinks(markdown, headings)?.map((link) => link.target),
    ["lesson-1.md", "quiz-1.md", "./lesson 2.md", "deeper.md"],
  );
  assertEquals(
    overviewLinks("# Week\n\n## Notes\n- [a](a.md)\n", headings),
    undefined,
  );
  assertEquals(
    overviewLinks("## Weekoverzicht\n- [a](a.md)\n", ["Weekoverzicht"])?.length,
    1,
  );
});

Deno.test("the lead page of a module is recognised by its name", () => {
  for (
    const name of [
      "index.md",
      "weekintro-1.md",
      "weekindex_2.md",
      "Overview.md",
    ]
  ) {
    assertEquals(isLeadPageName(name), true, name);
  }
  assertEquals(isLeadPageName("lesson-1.md"), false);
  // The whole file name, not a prefix of it.
  for (
    const name of [
      "index-2.md",
      "introduction.md",
      "overview-of-tests.md",
      "weekintro-one.md",
      "index.html",
      "index",
    ]
  ) {
    assertEquals(isLeadPageName(name), false, name);
  }
});

async function course(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
) {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "menu-",
  });
  try {
    for (const [path, text] of Object.entries(files)) {
      await Deno.mkdir(join(root, path, ".."), { recursive: true });
      await Deno.writeTextFile(join(root, path), text);
    }
    await run(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

const plan = (root: string, paths: string[]) =>
  planMenu({
    sourcesDir: root,
    files: paths.map((path) => join(root, path)),
    overviewHeadings: headings,
  });
const rules = (result: Awaited<ReturnType<typeof planMenu>>, root: string) =>
  result.issues.map((issue) =>
    `${issue.file.slice(resolve(root).length + 1)}:${issue.line}:${issue.rule}`
  );

Deno.test("O1/O6/O7/O8/O10: a module with an overview publishes what it lists, in list order", async () => {
  await course({
    "week-1/weekintro-1.md":
      "# Week 1\n\n## Overview\n\n- [B](b.md)\n- [Quiz](quiz-z.md)\n- [A](a.md)\n",
    "week-1/a.md": "# A\n",
    "week-1/b.md": "# B\n",
    "week-1/quiz-z.md": "# Quiz\n",
    "week-1/c.md": "# C, forgotten\n",
    "week-1/d.md": "---\ndraft: true\n---\n# D, not ready\n",
  }, async (root) => {
    const result = await plan(root, [
      "week-1/weekintro-1.md",
      "week-1/a.md",
      "week-1/b.md",
      "week-1/quiz-z.md",
      "week-1/c.md",
      "week-1/d.md",
    ]);
    const order = [...result.listed].sort((x, y) => x[1] - y[1]).map(([file]) =>
      file.slice(resolve(root).length + 1)
    );
    assertEquals(order, ["week-1/b.md", "week-1/quiz-z.md", "week-1/a.md"]);
    // c is forgotten (warning); d is left out on purpose (no warning).
    assertEquals(
      [...result.excluded].map((file) => file.slice(resolve(root).length + 1))
        .sort(),
      ["week-1/c.md", "week-1/d.md"],
    );
    assertEquals(rules(result, root), ["week-1/c.md:1:menu-unlisted"]);
  });
});

Deno.test("O9: a missing link and a link listed twice are errors, a draft or a position on a listed file is a warning", async () => {
  await course({
    "w/index.md":
      "# W\n\n## Overview\n- [A](a.md)\n- [Gone](gone.md)\n- [A again](a.md)\n- [P](p.md)\n- [D](d.md)\n",
    "w/a.md": "# A\n",
    "w/p.md": "---\nsidebar_position: 2\n---\n# P\n",
    "w/d.md": "---\ndraft: true\n---\n# D\n",
  }, async (root) => {
    const result = await plan(root, [
      "w/index.md",
      "w/a.md",
      "w/p.md",
      "w/d.md",
    ]);
    assertEquals(rules(result, root), [
      "w/index.md:5:menu-link-missing",
      "w/index.md:6:menu-link-twice",
      "w/index.md:8:menu-draft-listed",
      "w/p.md:1:menu-position-listed",
    ]);
  });
});

Deno.test("O3/O9: positions are unique per folder and all or none, in a module without overview", async () => {
  await course({
    "w/index.md": "# W\n",
    "w/a.md": "---\nsidebar_position: 1\n---\n# A\n",
    "w/b.md": "---\nsidebar_position: 1\n---\n# B\n",
    "w/c.md": "# C\n",
    "x/index.md": "# X\n",
    "x/a.md": "# A\n",
    "x/b.md": "# B\n",
  }, async (root) => {
    const result = await plan(root, [
      "w/index.md",
      "w/a.md",
      "w/b.md",
      "w/c.md",
      "x/index.md",
      "x/a.md",
      "x/b.md",
    ]);
    assertEquals(rules(result, root), [
      "w/b.md:1:menu-position-duplicate",
      "w/c.md:1:menu-position-partial",
    ]);
    assertEquals(result.positions.get(join(resolve(root), "w/a.md")), 1);
    // No overview: nothing is left out.
    assertEquals(result.excluded.size, 0);
  });
});

Deno.test("O2: menu.overviewHeadings is validated and has a default", () => {
  const base = { courseName: "C", version: "1", sourcesDir: "lessons" };
  validateConfig({ ...base, menu: { overviewHeadings: ["Weekoverzicht"] } });
  assertThrows(
    () => validateConfig({ ...base, menu: { overviewHeadings: [] } }),
    Error,
    "menu.overviewHeadings",
  );
  assertThrows(
    () => validateConfig({ ...base, menu: { order: [] } }),
    Error,
    "menu.order",
  );
  assertEquals(
    resolveConfig(base, {}, Deno.cwd()).menu.overviewHeadings,
    ["Overview", "Overzicht"],
  );
  assertEquals(
    resolveConfig(
      { ...base, menu: { overviewHeadings: [" Weekoverzicht "] } },
      {},
      Deno.cwd(),
    ).menu.overviewHeadings,
    ["Weekoverzicht"],
  );
});
