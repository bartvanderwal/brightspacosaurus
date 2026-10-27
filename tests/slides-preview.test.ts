import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { dirname, join, resolve } from "@std/path";
import JSZip from "jszip";
import { validateConfig } from "../src/config-loader.ts";
import {
  DECK_KEY_PREFIX,
  deckWantsPptx,
  exportSlidesToContent,
  EXTRA_KEY_PREFIX,
  LESSON_KEY_PREFIX,
  renderDiagramFences,
  renderPreviewSlides,
  type SlidesConfig,
  type SlidesRunner,
  stripBackControls,
  stripPresenterNotes,
  withBackControls,
  withSlideLayout,
} from "../src/slides-preview.ts";

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "slides-preview-test-",
  });
  try {
    await write(root, "lessons/week/lesson.md", "# Lesson");
    await write(root, "lessons/other.md", "# Other");
    await run(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

async function write(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  const destination = join(root, path);
  await Deno.mkdir(dirname(destination), { recursive: true });
  await Deno.writeTextFile(destination, content);
}

/** The decks of a result: without the entries for lesson presentations and extra slides. */
function lessonsOnly(result: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(result).filter(([key]) =>
      ![LESSON_KEY_PREFIX, EXTRA_KEY_PREFIX].some((prefix) =>
        key.startsWith(prefix)
      )
    ),
  );
}

function fake(captured: string[], argsCaptured: string[][] = []): SlidesRunner {
  return async (args) => {
    argsCaptured.push(args);
    if (args[0] === "install") {
      await installedTools(args[2]);
      return;
    }
    captured.push(await Deno.readTextFile(args[args.indexOf("marp") + 1]));
    await Deno.writeTextFile(
      args[args.indexOf("--output") + 1],
      '<html><head></head><body><section id="1" class="lead">Slide</section><!-- Notes --></body></html>',
    );
  };
}

async function installedTools(
  tools: string,
  xmlVersion = "0.9.12",
  katexVersion = "0.18.2",
): Promise<void> {
  await write(
    tools,
    "node_modules/@marp-team/marp-cli/package.json",
    JSON.stringify({ version: "4.5.1" }),
  );
  await write(
    tools,
    "node_modules/@xmldom/xmldom/package.json",
    JSON.stringify({ version: xmlVersion }),
  );
  await write(
    tools,
    "node_modules/katex/package.json",
    JSON.stringify({ version: katexVersion }),
  );
  await write(
    tools,
    "package-lock.json",
    JSON.stringify({
      packages: {
        "node_modules/@marp-team/marp-cli": { version: "4.5.1" },
        "node_modules/@xmldom/xmldom": { version: xmlVersion },
        "node_modules/katex": { version: katexVersion },
      },
    }),
  );
}

const config: SlidesConfig = { lessons: { "week/lesson.md": "decks/**/*.md" } };
const deck =
  "---\nmarp: true\ntheme: default\n---\n# Slide\n<!-- Speaker note -->\n";

Deno.test("slides preview: absent config is a strict no-op without filesystem access", async () => {
  assertEquals(
    await renderPreviewSlides(
      undefined,
      "missing-root",
      "missing-sources",
      "missing-static",
      () => {
        throw new Error("must not run");
      },
    ),
    {},
  );
});

Deno.test("slides preview: deterministic glob selection combines slides and retains notes", async () => {
  await fixture(async (root) => {
    await write(root, "decks/z.md", deck.replace("# Slide", "# Z"));
    await write(root, "decks/nested/a.md", deck.replace("# Slide", "# A"));
    await write(root, "decks/ordinary.md", "# Not a presentation");
    await write(root, "unmatched.md", deck);
    const captured: string[] = [];
    const args: string[][] = [];
    const map = await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured, args),
    );
    assertEquals(lessonsOnly(map), {
      [join(root, "lessons/week/lesson.md")]: "slides/week/lesson/index.html",
    });
    assertEquals(captured.length, 1);
    assert(captured[0].indexOf("# A") < captured[0].indexOf("# Z"));
    assertEquals(captured[0].match(/marp: true/g)?.length, 1);
    assertEquals(captured[0].match(/Speaker note/g)?.length, 2);
    assertStringIncludes(captured[0], "\n\n---\n\n# Z");
    assertEquals(args[0], [
      "install",
      "--prefix",
      join(root, "marp-tools"),
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
    ]);
    assertEquals(args[1].slice(0, 6), [
      "exec",
      "--prefix",
      join(root, "marp-tools"),
      "--offline",
      "--",
      "marp",
    ]);
    assertEquals(args[1].at(-1), "--allow-local-files");
    assert(!args[1].includes("--html"));
    assert(args[1].includes("--no-html"));
    assert(args[1].includes("--no-config"));
    const html = await Deno.readTextFile(
      join(root, "static/slides/week/lesson/index.html"),
    );
    assertStringIncludes(
      html,
      'section::before{content:"Preview"',
    );
    assertStringIncludes(html, "<!-- Notes -->");
    await assertRejects(
      () =>
        Deno.stat(join(root, "static/slides/week/lesson/.bso-slides-input.md")),
      Deno.errors.NotFound,
    );
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(captured[0], captured[1]);
    assertEquals(
      await Deno.readTextFile(
        join(root, "static/slides/week/lesson/index.html"),
      ),
      html,
    );
  });
});

Deno.test("slides preview: a course prefix generates matching lessons with explicit overrides", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesoverzicht-1.md",
      "# First\n\n## Goals\n\n- Learn\n",
    );
    await write(root, "lessons/week/lesoverzicht-2.md", "# Excluded");
    await write(
      root,
      "lessons/week/other-lesoverzicht.md",
      "# Not a prefix match",
    );
    await write(root, "lessons/week/lesoverzicht-manual.md", "# Manual lesson");
    await write(
      root,
      "decks/manual.md",
      "---\nslides: true\ntheme: default\n---\n\n# Authored slides\n",
    );
    const selected = {
      generateForPrefix: "lesoverzicht",
      lessons: {
        "week/lesoverzicht-2.md": { generate: false },
        "week/lesoverzicht-manual.md": "decks/manual.md",
      },
    };
    const captured: string[] = [];
    const result = await renderPreviewSlides(
      selected,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(Object.keys(lessonsOnly(result)), [
      join(root, "lessons/week/lesoverzicht-1.md"),
      join(root, "lessons/week/lesoverzicht-manual.md"),
    ]);
    assertEquals(captured.length, 2);
    assertStringIncludes(captured[0], "# First");
    assertStringIncludes(captured[1], "# Authored slides");
    assertEquals(captured[1].match(/marp: true/g)?.length, 1);
  });
});

Deno.test("slides preview: generated lesson slides combine with manual slide decks", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson title\n\n## Learning goals\n\nSome prose.\n\n- Goal one\n- Goal two\n\n## Diagram\n\n![Schema][schema]\n\n[schema]: ./schema.png\n",
    );
    await write(root, "lessons/week/schema.png", "png bytes");
    await write(
      root,
      "decks/manual.md",
      deck.replace("theme: default", "theme: gaia").replace(
        "# Slide",
        "# Manual",
      ),
    );
    const captured: string[] = [];
    const map = await renderPreviewSlides(
      {
        lessons: {
          "week/lesson.md": { generate: true, decks: "decks/*.md" },
        },
      },
      root,
      "lessons",
      "static",
      fake(captured),
    );

    assertEquals(Object.keys(lessonsOnly(map)).length, 1);
    assertStringIncludes(captured[0], "# Lesson title");
    assertStringIncludes(
      captured[0],
      "# Learning goals\n\n- Goal one\n- Goal two",
    );
    assertStringIncludes(captured[0], "# Manual");
    assertEquals(captured[0].includes("Some prose."), false);
    assertStringIncludes(captured[0], "theme: gaia");
    assertStringIncludes(captured[0], "data:image/png;base64,cG5nIGJ5dGVz");
    assertEquals(captured[0].match(/marp: true/g)?.length, 1);
  });
});

// Spec *Generated deck pptx*, rules X1-X3.
Deno.test("slides preview: a generated deck gets a pptx, nested pages and images included, only when the lesson asks for it", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    ),
    (c) => c.charCodeAt(0),
  );
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson title\n\n## 1. Goals\n\n- Goal one\n- Goal two\n\n[Page](levels/unit.md)\n\n## 2. Picture\n\n![Schema](schema.png)\n",
    );
    await write(
      root,
      "lessons/week/levels/unit.md",
      "# Unit tests\n\n## 1. Fast\n\n- Runs in milliseconds\n",
    );
    await Deno.writeFile(join(root, "lessons/week/schema.png"), png);
    const output = join(root, "static", "slides", "week", "lesson");
    const run = async (
      selection: Record<string, unknown>,
      course: Record<string, unknown> = {},
    ) => {
      await Deno.remove(join(root, "static"), { recursive: true }).catch(() =>
        undefined
      );
      await renderPreviewSlides(
        { lessons: { "week/lesson.md": selection }, ...course } as SlidesConfig,
        root,
        "lessons",
        "static",
        fake([]),
      );
    };
    const exists = (path: string) =>
      Deno.stat(path).then(() => true, () => false);

    // X1: nothing without a request.
    await run({ generate: true, nest: "levels/*.md" });
    assertEquals(await exists(join(output, "lesson.pptx")), false);

    // X1: the lesson asks for it.
    await run({ generate: true, nest: "levels/*.md", pptx: true });
    const zip = await JSZip.loadAsync(
      await Deno.readFile(join(output, "lesson.pptx")),
    );
    const text = (await Promise.all(
      Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name)
      ).map((name) => zip.file(name)!.async("string")),
    )).join("\n");
    // X2: the slides of the lesson, the nested page and the image.
    assertStringIncludes(text, "Goal one");
    assertStringIncludes(text, "Unit tests");
    assertStringIncludes(text, "Runs in milliseconds");
    assertEquals(
      Object.keys(zip.files).some((name) => name.startsWith("ppt/media/")),
      true,
    );

    // X1: the course setting is for the dedicated decks, not for the generated deck of a lesson.
    await run({ generate: true, nest: "levels/*.md" }, { pptx: true });
    assertEquals(await exists(join(output, "lesson.pptx")), false);
    await run({ generate: true, nest: "levels/*.md", pptx: false }, {
      pptx: true,
    });
    assertEquals(await exists(join(output, "lesson.pptx")), false);
  });
});

// Spec *Nested lesson pages*, rule N13.
Deno.test("slides preview: a manual deck with nest gets the linked lesson pages after it as appendix slides, in the pptx too", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson 8.4\n\n## Bijlagen\n\n### Bijlage A\n\n- [Form](levels/form.md)\n\n### Bijlage B\n\n- [Unit](levels/unit.md)\n",
    );
    await write(
      root,
      "lessons/week/levels/form.md",
      "# Form\n\n## 1. Fields\n\n- name\n",
    );
    await write(
      root,
      "lessons/week/levels/unit.md",
      "# Unit tests\n\n## 1. Fast\n\n- Runs in milliseconds\n",
    );
    await write(
      root,
      "decks/manual.md",
      "---\nmarp: true\ntheme: default\nheadingDivider: 2\n---\n\n## Slide 1 - Start\n\n- the manual deck\n\n## Slide 2 - Next\n\n- more\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      {
        pptx: true,
        lessons: {
          "week/lesson.md": { decks: "decks/*.md", nest: "levels/*.md" },
        },
      } as SlidesConfig,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const input = captured[0];
    // The manual slides first, then the pages in link order as appendix slides.
    assertEquals(
      input.indexOf("Slide 2 - Next") < input.indexOf("# Form") &&
        input.indexOf("# Form") < input.indexOf("# Unit tests"),
      true,
    );
    assertStringIncludes(input, '<!-- _footer: "Bijlage 1/4" -->');
    assertStringIncludes(input, '<!-- _footer: "Bijlage 4/4" -->');
    assertStringIncludes(input, "<style>section.appendix footer");
    // With headingDivider 2 Marp splits at the headings itself: a `---` before one, or a comment
    // or a style before the first heading of a slide, would give an empty slide (rule A7).
    const appendix = input.slice(input.indexOf("# Form"));
    assertEquals(/---\s*\n\s*#\s/.test(appendix), false);
    assertEquals(
      input.indexOf("<style>section.appendix") > input.indexOf("# Unit tests"),
      true,
    );
    const zip = await JSZip.loadAsync(
      await Deno.readFile(
        join(root, "static", "slides", "week", "lesson", "manual.pptx"),
      ),
    );
    const text = (await Promise.all(
      Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name)
      ).map((name) => zip.file(name)!.async("string")),
    )).join("\n");
    assertStringIncludes(text, "the manual deck");
    assertStringIncludes(text, "Runs in milliseconds");
    assertStringIncludes(text, "Bijlage 4/4");
  });
});

Deno.test("slides preview: shared theme and logo are applied to lead slides", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "shared/theme.css",
      "/* @theme course-theme */\nsection { color: red; }\n",
    );
    await Deno.writeFile(
      join(root, "shared/logo.png"),
      new Uint8Array([137, 80, 78, 71]),
    );
    await write(root, "decks/slides.md", deck);
    const captured: string[] = [];
    const args: string[][] = [];
    await renderPreviewSlides(
      {
        ...config,
        theme: "shared/theme.css",
        logo: "shared/logo.png",
      },
      root,
      "lessons",
      "static",
      fake(captured, args),
    );

    assertStringIncludes(captured[0], "theme: course-theme");
    assert(!captured[0].includes("theme: default"));
    assertEquals(args[1].slice(-2), [
      "--theme-set",
      join(root, "shared/theme.css"),
    ]);
    const html = await Deno.readTextFile(
      join(root, "static/slides/week/lesson/index.html"),
    );
    assertStringIncludes(
      html,
      `src="data:image/png;base64,${
        btoa(String.fromCharCode(137, 80, 78, 71))
      }"`,
    );
    assertStringIncludes(html, 'class="bso-slide-logo"');
    assertEquals(html.match(/bso-slide-logo/g)?.length, 1);

    const generated: string[] = [];
    await renderPreviewSlides(
      {
        lessons: { "week/lesson.md": { generate: true } },
        theme: "shared/theme.css",
      },
      root,
      "lessons",
      "generated-static",
      fake(generated),
    );
    assertStringIncludes(generated[0], "theme: course-theme");
  });
});

Deno.test("slides preview: only top-level true frontmatter selects slide decks", async () => {
  await fixture(async (root) => {
    const rejected = [
      "# Markdown\nmarp: true",
      "---\nmarp: false\n---\n# No",
      "---\nmarp:true\n---\n# Not a YAML mapping",
      '---\nmarp: "true"\n---\n# No',
      "---\nmetadata:\n  marp: true\n---\n# No",
      "---\ntext: |\n  marp: true\n---\n# No",
      "---\n# marp: true\n---\n# No",
      "---\nmarp: true\nmarp: false\n---\n# No",
      "---\nmarp: true\nnot yaml\n---\n# No",
      "---\nmarp: true\n# Missing closing delimiter",
    ];
    for (let i = 0; i < rejected.length; i++) {
      await write(root, `decks/${i}.md`, rejected[i]);
    }
    assertEquals(
      await renderPreviewSlides(config, root, "lessons", "static", () => {
        throw new Error("must not run");
      }),
      {},
    );
    await write(
      root,
      "decks/valid.md",
      "\uFEFF---\r\nslides: true # enabled\r\n---\r\n# Yes",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(captured.length, 1);
    assertStringIncludes(captured[0], "# Yes");
    assertStringIncludes(captured[0], "marp: true");
    assertEquals(captured[0].includes("slides: true"), false);
  });
});

Deno.test("slides preview: broad globs never select GitHub metadata", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    await write(
      root,
      ".github/preview-private.md",
      deck.replace("# Slide", "# Private metadata"),
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      { lessons: { "week/lesson.md": "**/*.md" } },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(captured.length, 1);
    assertStringIncludes(captured[0], "# Slide");
    assert(!captured[0].includes("Private metadata"));
  });
});

Deno.test("slides preview: embeds inline, reference, background and CSS local images", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "decks/image.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    await write(
      root,
      "decks/slides.md",
      "---\nmarp: true\nstyle: |\n  section { background-image: url('image.svg'); }\n---\n" +
        '# Images\n![bg](image.svg)\n![inline](<image.svg> "title")\n![reference][picture]\n' +
        "\n[picture]: image.svg\n\n![remote](https://example.org/pic.png)\n![data](data:image/png;base64,YQ==)\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    // The CSS keeps the data URL; Markdown images get a placeholder that is
    // replaced in the rendered HTML, because Marp rejects SVG data URLs (also
    // for backgrounds) and would show the image as text.
    assertEquals(captured[0].match(/data:image\/svg\+xml;base64,/g)?.length, 1);
    assertEquals(captured[0].match(/bso-embedded-svg-0\.svg/g)?.length, 3);
    assertStringIncludes(captured[0], "![bg](<bso-embedded-svg-0.svg>)");
    assertStringIncludes(captured[0], "url(data:");
    assertStringIncludes(captured[0], '"title"');
    assertStringIncludes(captured[0], "![remote](https://example.org/pic.png)");
    assertStringIncludes(captured[0], "![data](data:image/png;base64,YQ==)");
    assertEquals(
      await Deno.readTextFile(join(root, "decks/image.svg")),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
  });
});

Deno.test("slides preview: banner escapes CSS and closing style tags, empty disables", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    const disclaimer = 'quote"\\\n</style><script>alert(1)</script>';
    await renderPreviewSlides(
      { ...config, disclaimer },
      root,
      "lessons",
      "static",
      fake([]),
    );
    const path = join(root, "static/slides/week/lesson/index.html");
    const html = await Deno.readTextFile(path);
    // the preview's own back handler is a script; the disclaimer must add none
    assert(!html.includes("<script>alert(1)"));
    assertStringIncludes(html, "\\22 ");
    assertStringIncludes(html, "\\5c ");
    assertStringIncludes(html, "\\a ");
    assertStringIncludes(html, "\\3c /style\\3e ");
    await renderPreviewSlides(
      { ...config, disclaimer: "" },
      root,
      "lessons",
      "static",
      fake([]),
    );
    assert(!(await Deno.readTextFile(path)).includes("bso-slide-disclaimer"));
  });
});

Deno.test("slides preview: removes only stale slides, empty mappings clear slides", async () => {
  await fixture(async (root) => {
    await write(root, "static/slides/stale.html", "stale");
    await write(root, "static/unrelated.txt", "keep");
    await write(root, "decks/slides.md", deck);
    await renderPreviewSlides(config, root, "lessons", "static", fake([]));
    await assertRejects(
      () => Deno.stat(join(root, "static/slides/stale.html")),
      Deno.errors.NotFound,
    );
    assertEquals(
      await Deno.readTextFile(join(root, "static/unrelated.txt")),
      "keep",
    );
    assertEquals(
      await renderPreviewSlides(
        { lessons: {} },
        root,
        "lessons",
        "static",
        fake([]),
      ),
      {},
    );
    await assertRejects(
      () => Deno.stat(join(root, "static/slides")),
      Deno.errors.NotFound,
    );
    assertEquals(
      await Deno.readTextFile(join(root, "static/unrelated.txt")),
      "keep",
    );
  });
});

Deno.test("slides preview: encoded URL corresponds to the actual lesson output directory", async () => {
  await fixture(async (root) => {
    await write(root, "lessons/week/les één.md", "# Lesson");
    await write(root, "decks/slides.md", deck);
    const map = await renderPreviewSlides(
      { lessons: { "week/les één.md": "decks/*.md" } },
      root,
      "lessons",
      "static",
      fake([]),
    );
    assertEquals(
      map[join(root, "lessons/week/les één.md")],
      "slides/week/les%20%C3%A9%C3%A9n/index.html",
    );
    assert(
      (await Deno.stat(join(root, "static/slides/week/les één/index.html")))
        .isFile,
    );
  });
});

Deno.test("slides preview: CSS examples are not treated as local background images", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "decks/slides.md",
      deck + "\n```css\nsection {background: url(nonexistent.svg)}\n```\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertStringIncludes(captured[0], "url(nonexistent.svg)");
  });
});

Deno.test("slides preview: CSS-looking URLs in presenter notes and metadata are preserved", async () => {
  await fixture(async (root) => {
    const source = deck.replace(
      "theme: default",
      'theme: default\ntitle: "Explain url(nonexistent-title.png)"\nmetadata:\n  style: "url(nonexistent-metadata.png)"',
    ) +
      "\n<!-- Explain url(nonexistent.png) -->\n<!-- title: url(nonexistent-comment-title.png) -->\n" +
      "<!-- Explain <style>url(nonexistent-tag.png)</style> -->\n" +
      "<!-- Presenter notes\nstyle: url(nonexistent-note-style.png)\n-->\n";
    await write(root, "decks/slides.md", source);
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(captured[0], source);
  });
});

Deno.test("slides preview: CSS data URLs keep quoted YAML valid and remote CSS unchanged", async () => {
  await fixture(async (root) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    await write(root, "decks/image.svg", svg);
    const data = `data:image/svg+xml;base64,${btoa(svg)}`;
    for (
      const [outer, inner] of [['"', "'"], ["'", '"'], ['"', String.raw`\"`], [
        "'",
        "''",
      ]]
    ) {
      const style =
        `style: ${outer}section { background: url(${inner}image.svg${inner}); mask: url(${inner}https://example.org/image.svg${inner}); }${outer}`;
      await write(
        root,
        "decks/slides.md",
        deck.replace("theme: default", `theme: default\n${style}`) +
          `\n<!-- ${style} -->\n`,
      );
      const captured: string[] = [];
      await renderPreviewSlides(
        config,
        root,
        "lessons",
        "static",
        fake(captured),
      );
      assertStringIncludes(
        captured[0],
        style.replace(`url(${inner}image.svg${inner})`, `url(${data})`),
      );
      assertStringIncludes(
        captured[0],
        `<!-- ${
          style.replace(`url(${inner}image.svg${inner})`, `url(${data})`)
        } -->`,
      );
    }
  });
});

Deno.test("slides preview: deck-local image and link references cannot collide after merging", async () => {
  await fixture(async (root) => {
    const red =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>';
    const blue =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="blue"/></svg>';
    await write(root, "decks/red.svg", red);
    await write(root, "decks/blue.svg", blue);
    await write(
      root,
      "decks/a.md",
      deck +
        '\n![bg][picture]\n\n[**Source**][source]\n\n[picture]: red.svg "Red title"\n[source]: https://red.example\n',
    );
    await write(
      root,
      "decks/b.md",
      deck +
        "\n![diagram][picture]\n\n[![thumbnail][picture]][source]\n\n![picture][]\n\n![picture]\n\n" +
        '[picture]: blue.svg "Blue title"\n[source]: https://blue.example\n<!-- Explain url(nonexistent.png) -->\n',
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const redUrl = "bso-embedded-svg-0.svg";
    const blueUrl = "bso-embedded-svg-1.svg";
    assertStringIncludes(captured[0], `![bg](<${redUrl}> "Red title")`);
    assertStringIncludes(captured[0], `![diagram](<${blueUrl}> "Blue title")`);
    assertStringIncludes(captured[0], `[**Source**](<https://red.example>)`);
    assertStringIncludes(
      captured[0],
      `[![thumbnail](<${blueUrl}> "Blue title")](<https://blue.example>)`,
    );
    assertEquals(
      captured[0].match(/!\[picture\]\(<bso-embedded-svg-/g)?.length,
      2,
    );
    assert(!captured[0].includes("[picture]:"));
    assert(!captured[0].includes("[source]:"));
    assertStringIncludes(captured[0], "<!-- Explain url(nonexistent.png) -->");
  });
});

Deno.test("slides preview: rewrites CSS in style comments and tags without touching adjacent metadata", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "decks/image.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const source = deck +
      "\n<!--\nstyle: |\n  section { background-image: url(image.svg) }\ntitle: url(nonexistent-title.png)\n-->\n" +
      '<style>section { background: url("image.svg") }</style>\n' +
      "<!-- Explain url(nonexistent-note.png) -->\n";
    await write(root, "decks/slides.md", source);
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(captured[0].match(/data:image\/svg\+xml;base64,/g)?.length, 2);
    assertStringIncludes(captured[0], "title: url(nonexistent-title.png)");
    assertStringIncludes(
      captured[0],
      "<!-- Explain url(nonexistent-note.png) -->",
    );
  });
});

Deno.test("slides preview: aliases and case variants cannot overwrite another lesson output", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    await write(root, "lessons/week/lesson.MD", "# Second lesson");
    for (const alias of ["week/./lesson.md", "week/lesson.MD"]) {
      await assertRejects(
        () =>
          renderPreviewSlides(
            {
              lessons: {
                "week/lesson.md": "decks/*.md",
                [alias]: "decks/*.md",
              },
            },
            root,
            "lessons",
            "static",
            fake([]),
          ),
        Error,
        "duplicate lesson output",
      );
    }
  });
});

Deno.test("slides preview: rejects unsafe mappings and missing lessons before deleting output", async () => {
  await fixture(async (root) => {
    await write(root, "static/slides/keep.html", "keep");
    const bad: SlidesConfig[] = [
      { lessons: { "../outside.md": "decks/*.md" } },
      { lessons: { "/absolute.md": "decks/*.md" } },
      { lessons: { "week/lesson.md": "../*.md" } },
      { lessons: { "week/lesson.md": "/decks/*.md" } },
      { lessons: { "week/lesson.md": "" } },
      { lessons: { "missing.md": "decks/*.md" } },
      { lessons: [] as unknown as Record<string, string> },
      { lessons: { "week/lesson.md": 42 as unknown as string } },
      { ...config, disclaimer: 42 as unknown as string },
    ];
    for (const invalid of bad) {
      await assertRejects(
        () => renderPreviewSlides(invalid, root, "lessons", "static", fake([])),
        Error,
        "Slides preview:",
      );
    }
    assertEquals(
      await Deno.readTextFile(join(root, "static/slides/keep.html")),
      "keep",
    );
    await assertRejects(
      () => renderPreviewSlides(config, root, "../", "static", fake([])),
      Error,
      "outside root",
    );
    await assertRejects(
      () =>
        renderPreviewSlides(config, root, "lessons", "../outside", fake([])),
      Error,
      "outside root",
    );
  });
});

Deno.test("slides preview: rejects escaped image paths, invalid URLs and missing images", async () => {
  await fixture(async (root) => {
    for (
      const [image, message] of [
        ["../../outside.svg", "outside root"],
        ["missing.svg", "cannot read image"],
        ["file:///outside.svg", "unsupported image URL"],
        ["%zz.svg", "invalid image URL"],
        ["unknown.txt", "unsupported local image"],
      ]
    ) {
      await write(root, "decks/slides.md", deck + `\n![image](${image})`);
      await assertRejects(
        () => renderPreviewSlides(config, root, "lessons", "static", fake([])),
        Error,
        message,
      );
    }
  });
});

Deno.test("slides preview: symlink slide decks are skipped, asset and output escapes rejected", async () => {
  await fixture(async (root) => {
    const outside = dirname(root);
    await Deno.mkdir(join(root, "decks"));
    await write(root, "actual.md", deck);
    await Deno.symlink(join(root, "actual.md"), join(root, "decks/link.md"));
    assertEquals(
      await renderPreviewSlides(config, root, "lessons", "static", fake([])),
      {},
    );
    await Deno.symlink(outside, join(root, "decks/linked-dir"));
    assertEquals(
      await renderPreviewSlides(config, root, "lessons", "static", fake([])),
      {},
    );
    await Deno.symlink(outside, join(root, "decks/escaped.svg"));
    await write(root, "decks/slides.md", deck + "\n![image](escaped.svg)");
    await assertRejects(
      () => renderPreviewSlides(config, root, "lessons", "static", fake([])),
      Error,
      "outside root",
    );
    await Deno.symlink(outside, join(root, "escaped-output"));
    await assertRejects(
      () =>
        renderPreviewSlides(
          config,
          root,
          "lessons",
          "escaped-output",
          fake([]),
        ),
      Error,
      "outside root",
    );
    await Deno.mkdir(join(root, "static"), { recursive: true });
    await Deno.symlink(outside, join(root, "static/slides"));
    await assertRejects(
      () => renderPreviewSlides(config, root, "lessons", "static", fake([])),
      Error,
      "outside root",
    );
  });
});

Deno.test("slides preview: renderer failures name lesson and slide decks, temporary input is removed", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    await assertRejects(
      () =>
        renderPreviewSlides(config, root, "lessons", "static", async (args) => {
          if (args[0] === "install") {
            await installedTools(args[2]);
            return;
          }
          throw new Error("Marp exited 42: broken theme");
        }),
      Error,
      "Marp exited 42: broken theme",
    );
    await assertRejects(
      () =>
        Deno.stat(join(root, "static/slides/week/lesson/.bso-slides-input.md")),
      Deno.errors.NotFound,
    );
    await assertRejects(
      () =>
        renderPreviewSlides(config, root, "lessons", "static", async () => {}),
      Error,
      "rendering lesson",
    );
  });
});

// Opt-in integration installs the patched toolchain rather than using an unpatched binary.
const runMarpIntegration = Boolean(Deno.env.get("BSO_TEST_MARP"));
Deno.test("slides preview: installs patched tools once, reuses cache and repairs stale versions", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    const commands: string[][] = [];
    const mappings = {
      lessons: { "week/lesson.md": "decks/*.md", "other.md": "decks/*.md" },
    };
    await renderPreviewSlides(
      mappings,
      root,
      "lessons",
      "static",
      fake([], commands),
    );
    assertEquals(commands.filter((args) => args[0] === "install").length, 1);
    assertEquals(commands.filter((args) => args[0] === "exec").length, 2);
    const tools = join(root, "marp-tools");
    await assertRejects(
      () => Deno.stat(join(root, "static/marp-tools")),
      Deno.errors.NotFound,
    );
    const manifest = JSON.parse(
      await Deno.readTextFile(join(tools, "package.json")),
    );
    assertEquals(manifest, {
      private: true,
      dependencies: { "@marp-team/marp-cli": "4.5.1" },
      overrides: { "@xmldom/xmldom": "0.9.12", katex: "0.18.2" },
    });
    commands.length = 0;
    await renderPreviewSlides(
      mappings,
      root,
      "lessons",
      "static",
      fake([], commands),
    );
    assertEquals(commands.filter((args) => args[0] === "install").length, 0);
    await installedTools(tools, "0.9.10");
    commands.length = 0;
    await renderPreviewSlides(
      mappings,
      root,
      "lessons",
      "static",
      fake([], commands),
    );
    assertEquals(commands.filter((args) => args[0] === "install").length, 1);
    await installedTools(tools, "0.9.12", "0.16.9");
    commands.length = 0;
    await renderPreviewSlides(
      mappings,
      root,
      "lessons",
      "static",
      fake([], commands),
    );
    assertEquals(commands.filter((args) => args[0] === "install").length, 1);
  });
});

Deno.test("slides preview: tool cache stays outside a cartridge output directory named build", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    await write(root, "build/content/lesson.html", "Cartridge content");
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "preview-static",
      fake([]),
    );
    assert((await Deno.stat(join(root, "marp-tools"))).isDirectory);
    await assertRejects(
      () => Deno.stat(join(root, "build/marp-tools")),
      Deno.errors.NotFound,
    );
    await assertRejects(
      () => Deno.stat(join(root, "preview-static/marp-tools")),
      Deno.errors.NotFound,
    );
    assertEquals(
      await Deno.readTextFile(join(root, "build/content/lesson.html")),
      "Cartridge content",
    );
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "preview/static",
      fake([]),
    );
    assert((await Deno.stat(join(root, "preview/marp-tools"))).isDirectory);
    await assertRejects(
      () => Deno.stat(join(root, "preview/static/marp-tools")),
      Deno.errors.NotFound,
    );
  });
});

Deno.test("slides preview: fails if installer leaves vulnerable math dependencies", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    for (const [xml, katex] of [["0.9.10", "0.18.2"], ["0.9.12", "0.16.9"]]) {
      await assertRejects(
        () =>
          renderPreviewSlides(
            config,
            root,
            "lessons",
            "static",
            async (args) => {
              if (args[0] === "install") {
                await installedTools(args[2], xml, katex);
              }
            },
          ),
        Error,
        "did not install patched",
      );
    }
  });
});

Deno.test("slides preview: tool cache cannot be inside static output or escape the root", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    await assertRejects(
      () =>
        renderPreviewSlides(config, root, "lessons", "marp-tools", fake([])),
      Error,
      "must not contain the tool cache",
    );
    await Deno.remove(join(root, "marp-tools"), { recursive: true });
    await Deno.symlink(dirname(root), join(root, "marp-tools"));
    await assertRejects(
      () => renderPreviewSlides(config, root, "lessons", "static", fake([])),
      Error,
      "outside root",
    );
  });
});

Deno.test({
  name:
    "slides preview: real Marp applies quoted YAML styles and keeps duplicate references deck-local",
  ignore: !runMarpIntegration,
  fn: async () => {
    await fixture(async (root) => {
      const red =
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
      const blue =
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>';
      await write(root, "decks/red.svg", red);
      await write(root, "decks/blue.svg", blue);
      for (
        const [name, outer, inner] of [
          ["double", '"', "'"],
          ["single", "'", '"'],
          ["escaped-double", '"', String.raw`\"`],
          ["escaped-single", "'", "''"],
        ]
      ) {
        await write(
          root,
          `decks/${name}.md`,
          deck.replace(
            "theme: default",
            `theme: default\nstyle: ${outer}section { background-image: url(${inner}red.svg${inner}); --bso-smoke:quoted-${name}; }${outer}`,
          ),
        );
      }
      await write(root, "lessons/combined.md", "# Combined");
      await write(root, "lessons/escaped-double.md", "# Escaped double style");
      await write(root, "lessons/escaped-single.md", "# Escaped single style");
      await write(
        root,
        "decks/a.md",
        deck +
          '\n![Red diagram][picture]\n\n[Source][source]\n\n[picture]: red.svg "Red title"\n[source]: https://red.example\n',
      );
      await write(
        root,
        "decks/b.md",
        deck +
          '\n![Blue diagram][picture]\n\n[Source][source]\n\n[picture]: blue.svg "Blue title"\n[source]: https://blue.example\n',
      );
      await renderPreviewSlides(
        {
          lessons: {
            "week/lesson.md": "decks/double.md",
            "other.md": "decks/single.md",
            "combined.md": "decks/{a,b}.md",
            "escaped-double.md": "decks/escaped-double.md",
            "escaped-single.md": "decks/escaped-single.md",
          },
        },
        root,
        "lessons",
        "static",
      );
      const redUrl = `data:image/svg+xml;base64,${btoa(red)}`;
      const blueUrl = `data:image/svg+xml;base64,${btoa(blue)}`;
      for (
        const [name, lesson] of [
          ["double", "week/lesson"],
          ["single", "other"],
          ["escaped-double", "escaped-double"],
          ["escaped-single", "escaped-single"],
        ]
      ) {
        const html = await Deno.readTextFile(
          join(root, `static/slides/${lesson}/index.html`),
        );
        assertStringIncludes(
          html.replace(/\s/g, ""),
          `--bso-smoke:quoted-${name}`,
        );
        assertStringIncludes(html, redUrl);
      }
      const html = await Deno.readTextFile(
        join(root, "static/slides/combined/index.html"),
      );
      const sections = [
        ...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g),
      ].map((match) => match[1]);
      assertEquals(sections.length, 2);
      assertStringIncludes(sections[0], `src="${redUrl}"`);
      assert(!sections[0].includes(blueUrl));
      assertStringIncludes(sections[1], `src="${blueUrl}"`);
      assert(!sections[1].includes(redUrl));
      assertStringIncludes(sections[0], 'title="Red title"');
      assertStringIncludes(sections[1], 'title="Blue title"');
      assertStringIncludes(sections[0], 'href="https://red.example"');
      assertStringIncludes(sections[1], 'href="https://blue.example"');
      assertEquals(html.match(/Speaker note/g)?.length, 2);
    });
  },
});

Deno.test({
  name:
    "slides preview: real patched Marp renders merged slides, offline images, notes and escaped source HTML",
  ignore: !runMarpIntegration,
  fn: async () => {
    await fixture(async (root) => {
      await write(
        root,
        "decks/pixel.svg",
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
      );
      await write(
        root,
        "decks/a.md",
        deck.replace(
          "theme: default",
          'theme: default\nmath: katex\npaginate: true\nheader: "Course header"\nfooter: "Course footer"',
        ) +
          '\n![bg](pixel.svg)\n\nInline math: $x^2 + y^2 = z^2$.\n\n<script id="unsafe-source">alert(1)</script>\n<!-- Explain url(nonexistent-note.png) -->',
      );
      await write(
        root,
        "decks/b.md",
        deck.replace("# Slide", "# Second").replace(
          "Speaker note",
          "Second speaker note",
        ),
      );
      await renderPreviewSlides(config, root, "lessons", "static");
      const html = await Deno.readTextFile(
        join(root, "static/slides/week/lesson/index.html"),
      );
      assertEquals(html.match(/<section\b/g)?.length, 2);
      assertStringIncludes(html, "data:image/svg+xml;base64,");
      assertStringIncludes(html, "Speaker note");
      assertStringIncludes(html, "Second speaker note");
      assertStringIncludes(html, "Explain url(nonexistent-note.png)");
      assertStringIncludes(html, "# Second".slice(2));
      assertStringIncludes(html, "bso-slide-disclaimer");
      assertStringIncludes(html, 'class="katex"');
      assertEquals(html.match(/<header\b/g)?.length, 2);
      assertEquals(html.match(/<footer\b/g)?.length, 2);
      assertStringIncludes(html, "Course header");
      assertStringIncludes(html, "Course footer");
      assert(!html.includes('<script id="unsafe-source">'));
      const withoutBrowser: SlidesRunner = async (args, cwd) => {
        assertEquals(args[0], "exec");
        assert(args[args.indexOf("--output") + 1].endsWith(".html"));
        assert(
          !args.some((arg) => ["--pdf", "--image", "--pptx"].includes(arg)),
        );
        const output = await new Deno.Command("npm", {
          args,
          cwd,
          env: {
            CHROME_PATH: join(root, "missing-browser"),
            PUPPETEER_EXECUTABLE_PATH: join(root, "missing-browser"),
          },
          stdout: "piped",
          stderr: "piped",
        }).output();
        assert(output.success, new TextDecoder().decode(output.stderr));
      };
      await renderPreviewSlides(
        config,
        root,
        "lessons",
        "static",
        withoutBrowser,
      );
      assertStringIncludes(
        await Deno.readTextFile(
          join(root, "static/slides/week/lesson/index.html"),
        ),
        'class="katex"',
      );
    });
  },
});

Deno.test("slides preview: slides: true selects a slide deck and is passed to Marp as marp: true", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "decks/a.md",
      "---\nslides: true # new name\ntheme: gaia\n---\n# Slide A\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(captured.length, 1);
    assertStringIncludes(captured[0], "marp: true");
    assertEquals(captured[0].includes("slides:"), false);
    assertStringIncludes(captured[0], "theme: gaia");
  });
});

Deno.test("slides preview: marp and slides together are an error, slides: false does not select a slide deck", async () => {
  await fixture(async (root) => {
    await write(root, "decks/off.md", "---\nslides: false\n---\n# No");
    await write(root, "decks/quoted.md", '---\nslides: "true"\n---\n# No');
    assertEquals(
      await renderPreviewSlides(config, root, "lessons", "static", () => {
        throw new Error("must not run");
      }),
      {},
    );
    // Two markers leave open which one makes the deck: say so, never skip it silently.
    await write(
      root,
      "decks/both.md",
      "---\nmarp: true\nslides: true\n---\n# No",
    );
    await assertRejects(
      () =>
        renderPreviewSlides(config, root, "lessons", "static", () => {
          throw new Error("must not run");
        }),
      Error,
      "has both 'slides' and 'marp'",
    );
  });
});

Deno.test("slides export: one topic per lesson next to the lesson, titled after it, deterministic", async () => {
  await fixture(async (root) => {
    await write(root, "decks/a.md", deck.replace("# Slide", "# A"));
    await write(root, "shared/logo.png", "logo");
    await write(
      root,
      "content/week/lesson.html",
      "<html><body><h1>Lesson 1.1: Fizz &amp; Buzz</h1></body></html>",
    );
    const contentDir = join(root, "content");
    const run = () =>
      exportSlidesToContent(
        { ...config, logo: "shared/logo.png" },
        root,
        "lessons",
        "static",
        contentDir,
        fake([]),
      );
    const exported = await run();
    assertEquals(exported, ["week/lesson-slides.html"]);
    const html = await Deno.readTextFile(
      join(contentDir, "week", "lesson-slides.html"),
    );
    assertStringIncludes(
      html,
      '<meta name="bso-title" content="Slides: Lesson 1.1: Fizz &amp;amp; Buzz">',
    );
    // The course logo is placed at the start of the lead slide.
    assert(
      /<section[^>]*class="lead"[^>]*><img class="bso-slide-logo"/.test(html),
    );
    assertStringIncludes(
      html,
      '>Slide<span class="bso-footer-logo"></span></section>',
    );
    assertStringIncludes(html, 'class="bso-slide-logo"');
    assertStringIncludes(html, 'src="data:image/png;base64,bG9nbw=="');
    assertEquals(await run(), exported);
    assertEquals(
      await Deno.readTextFile(join(contentDir, "week", "lesson-slides.html")),
      html,
    );
  });
});

Deno.test("slides export: no configuration exports nothing", async () => {
  assertEquals(
    await exportSlidesToContent(
      undefined,
      "missing-root",
      "lessons",
      "static",
      "missing-content",
      () => {
        throw new Error("must not run");
      },
    ),
    [],
  );
});

Deno.test("stripPresenterNotes removes only the note elements, including nested markup", () => {
  const html =
    '<div id="p"><section>Slide</section></div><div class="bespoke-marp-note" data-index="0" tabindex="0"><p>Secret</p><div>inner</div></div><div class="bespoke-marp-note" data-index="1" tabindex="0"><ul><li>Also secret</li></ul></div><script>x</script>';
  assertEquals(
    stripPresenterNotes(html),
    '<div id="p"><section>Slide</section></div><script>x</script>',
  );
  const plain = "<html><body><section>No notes</section></body></html>";
  assertEquals(stripPresenterNotes(plain), plain);
});

Deno.test("slides export drops presenter notes unless slides.notes is true", async () => {
  const withNotes: SlidesRunner = async (args) => {
    if (args[0] === "install") {
      await installedTools(args[2]);
      return;
    }
    await Deno.writeTextFile(
      args[args.indexOf("--output") + 1],
      '<html><head></head><body><section>Slide</section><div class="bespoke-marp-note" data-index="0" tabindex="0"><p>Teacher only</p></div></body></html>',
    );
  };
  await fixture(async (root) => {
    await write(root, "decks/a.md", deck);
    await write(root, "content/week/lesson.html", "<h1>Lesson</h1>");
    const contentDir = join(root, "content");
    const read = () =>
      Deno.readTextFile(join(contentDir, "week", "lesson-slides.html"));

    await exportSlidesToContent(
      config,
      root,
      "lessons",
      "static",
      contentDir,
      withNotes,
    );
    const stripped = await read();
    assertStringIncludes(stripped, "Slide");
    assertEquals(stripped.includes("Teacher only"), false);

    await exportSlidesToContent(
      { ...config, notes: true },
      root,
      "lessons",
      "static",
      contentDir,
      withNotes,
    );
    assertStringIncludes(await read(), "Teacher only");

    // The preview keeps the notes: it renders through renderPreviewSlides.
    await renderPreviewSlides(config, root, "lessons", "static", withNotes);
    assertStringIncludes(
      await Deno.readTextFile(
        join(root, "static", "slides", "week", "lesson", "index.html"),
      ),
      "Teacher only",
    );
  });
});

Deno.test("deckWantsPptx: slide deck value wins, auto and absent take the course default", () => {
  const withValue = (value: string) =>
    `---\nslides: true\npptx: ${value}\n---\n# A\n`;
  assertEquals(deckWantsPptx("---\nslides: true\n---\n# A"), false);
  assertEquals(deckWantsPptx("---\nslides: true\n---\n# A", true), true);
  assertEquals(deckWantsPptx(withValue("auto"), true), true);
  assertEquals(deckWantsPptx(withValue("auto"), false), false);
  assertEquals(deckWantsPptx(withValue("true"), false), true);
  assertEquals(deckWantsPptx(withValue("false"), true), false);
  assertEquals(deckWantsPptx("# no front matter", true), true);
});

Deno.test("slides pptx: course default, slide deck override, link and export copy", async () => {
  await fixture(async (root) => {
    await write(root, "decks/a.md", deck.replace("# Slide", "# A"));
    await write(
      root,
      "decks/b.md",
      deck.replace("marp: true", "marp: true\npptx: false").replace(
        "# Slide",
        "# B",
      ),
    );
    await write(
      root,
      "content/week/lesson.html",
      "<html><body><h1>L</h1></body></html>",
    );
    const contentDir = join(root, "content");
    const run = (pptx?: boolean) =>
      exportSlidesToContent(
        { ...config, pptx },
        root,
        "lessons",
        "static",
        contentDir,
        fake([]),
      );
    await run(true);
    const html = await Deno.readTextFile(
      join(contentDir, "week", "lesson-slides.html"),
    );
    assertStringIncludes(html, 'href="lesson-a.pptx"');
    assert(!html.includes("b.pptx"));
    const bytes = await Deno.readFile(
      join(contentDir, "week", "lesson-a.pptx"),
    );
    assertEquals(bytes[0], 0x50); // zip header "PK"
    await Deno.remove(join(contentDir, "week"), { recursive: true });
    await write(
      root,
      "content/week/lesson.html",
      "<html><body><h1>L</h1></body></html>",
    );
    await run(false);
    const off = await Deno.readTextFile(
      join(contentDir, "week", "lesson-slides.html"),
    );
    assert(!off.includes(".pptx"));
  });
});

Deno.test("renderDiagramFences draws each diagram through Kroki and names the server on failure", async () => {
  const calls: string[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    calls.push(`${url} ${init.body}`);
    return Promise.resolve(new Response("<svg/>"));
  }) as unknown as typeof fetch;
  const md = "# Flow\n\n```plantuml\nA -> B\n```\n\ntext\n";
  const out = await renderDiagramFences(
    md,
    {
      krokiUrl: "http://kroki/",
      output: "img-html-base64",
      failOnError: true,
      locale: "en",
    },
    fetcher,
  );
  assertEquals(calls, ["http://kroki/plantuml/svg A -> B"]);
  assertStringIncludes(out, "![Flow](data:image/svg+xml;base64,PHN2Zy8+)");
  // With the placeholder map the Markdown carries no SVG data URL (Marp rejects it).
  const svgImages = new Map<string, string>();
  const placed = await renderDiagramFences(
    md,
    {
      krokiUrl: "http://kroki/",
      output: "img-html-base64",
      failOnError: true,
      locale: "en",
    },
    fetcher,
    svgImages,
  );
  assertStringIncludes(placed, "![Flow](bso-embedded-svg-0.svg)");
  assertEquals([...svgImages.values()], ["data:image/svg+xml;base64,PHN2Zy8+"]);
  assertEquals(await renderDiagramFences("# No diagrams"), "# No diagrams");
  const failing = (() =>
    Promise.resolve(
      new Response("", { status: 500 }),
    )) as unknown as typeof fetch;
  await assertRejects(
    () =>
      renderDiagramFences(md, {
        krokiUrl: "http://kroki",
        output: "img-html-base64",
        failOnError: true,
        locale: "en",
      }, failing),
    Error,
    "http://kroki",
  );
});

Deno.test("combined slide decks with headingDivider get no empty slides, manual separators stay", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## One\n\n- a\n\n## Two\n\n- b\n",
    );
    await write(
      root,
      "decks/a.md",
      "---\nslides: true\nheadingDivider: 2\n---\n# Manual\n\ntext\n\n---\n\nmore\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      {
        lessons: { "week/lesson.md": { generate: true, decks: "decks/a.md" } },
      },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const input = captured[0];
    const separators = input.split("\n").filter((line) => line === "---");
    // front matter pair + the author's own '---' between "text" and "more"
    assertEquals(separators.length, 3);
    assertStringIncludes(input, "text\n\n---\n\nmore");
  });
});

Deno.test("back controls give a hint and an Esc handler that steps back, and the export removes them", () => {
  const deck =
    "<html><head><title>x</title></head><body><section>a</section></body></html>";
  const withControls = withBackControls(deck, "back to the lesson");
  assertStringIncludes(withControls, "<b>Esc</b> back to the lesson");
  assertStringIncludes(withControls, "history.back()");
  assertStringIncludes(withControls, "Escape");
  assertStringIncludes(withControls, "KeyP");
  assertStringIncludes(withControls, "bespoke-marp-osc");
  assertStringIncludes(withControls, 'data-bespoke-marp-osc","back');
  assert(!withControls.includes("window.close"));
  assertEquals(stripBackControls(withControls), deck);
  assertEquals(stripBackControls(deck), deck);
  assertStringIncludes(withBackControls("<p>a</p>", "x"), "bso-slides-back");
});

Deno.test("slide layout fixes the title position, adds a footer logo on content slides and leaves lead slides alone", () => {
  const html =
    '<html><head></head><body><section id="1" class="lead">T</section><section id="2">A</section></body></html>';
  const out = withSlideLayout(html, "data:image/png;base64,AAAA");
  assertStringIncludes(out, "align-content:start!important");
  assertStringIncludes(out, "padding-top:52px!important");
  assertStringIncludes(out, "url(data:image/png;base64,AAAA)");
  assertStringIncludes(out, "section.lead .bso-footer-logo{display:none}");
  assertEquals(out.match(/<span class="bso-footer-logo"><\/span>/g)?.length, 2);
  assertEquals(
    out.indexOf("<style") < out.indexOf("</head>"),
    true,
  );
});

Deno.test("a slide deck without a theme gets the layout with the BSO logo, a course theme keeps its own", async () => {
  await fixture(async (root) => {
    await write(root, "decks/slides.md", deck);
    await renderPreviewSlides(config, root, "lessons", "static", fake([]));
    const path = join(root, "static/slides/week/lesson/index.html");
    const html = await Deno.readTextFile(path);
    assertStringIncludes(html, 'id="bso-slide-layout"');
    assertStringIncludes(html, "data:image/png;base64,");
    await write(
      root,
      "theme.css",
      "/* @theme mine */\nsection { color: red; }",
    );
    await renderPreviewSlides(
      { ...config, theme: "theme.css" },
      root,
      "lessons",
      "static",
      fake([]),
    );
    assert(!(await Deno.readTextFile(path)).includes("bso-slide-layout"));
  });
});

Deno.test("slide layout counts pages without appendix slides and gives appendix slides only their own number", () => {
  const html = "<html><head></head><body>" +
    '<section id="1" class="lead"><h1>T</h1></section>' +
    '<section id="2"><h1>One</h1></section>' +
    '<section id="3"><h1>Appendix A: Extra</h1></section>' +
    '<section id="4"><h1>More extra</h1></section></body></html>';
  const out = withSlideLayout(html, "data:image/png;base64,AAAA");
  assertEquals(out.match(/data-bso-total="2"/g)?.length, 4);
  assertEquals(out.match(/data-bso-appendix/g)?.length, 2 + 1); // two slides + the CSS selector
  assertStringIncludes(
    out,
    'attr(data-marpit-pagination) " / " attr(data-bso-total)',
  );
  const noAppendix = withSlideLayout(
    '<html><head></head><body><section id="1"><h1>A</h1></section><section id="2"><h1>B</h1></section></body></html>',
    "x",
  );
  assertEquals(noAppendix.match(/data-bso-total="2"/g)?.length, 2);
  assert(!/<section[^>]*data-bso-appendix/.test(noAppendix));
});

Deno.test("a slide deck linked in a lesson is inserted in the lesson slides and rendered as its own presentation", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. One\n\n- a\n\n[Extra](../../decks/extra.md)\n\n## 2. Two\n\n- b\n",
    );
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\ntitle: Extra deck\n---\n\n# Extra slide\n\nText.\n",
    );
    const captured: string[] = [];
    const result = await renderPreviewSlides(
      { lessons: { "week/lesson.md": { generate: true } } },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const lessonKey = Object.keys(result).find((key) =>
      key.endsWith("lesson.md")
    )!;
    const deckKey = Object.keys(result).find((key) =>
      key.startsWith(DECK_KEY_PREFIX)
    )!;
    assert(deckKey.endsWith("decks/extra.md"));
    assertEquals(result[deckKey], "slides/decks/decks/extra/index.html");
    const lessonDeck = captured.find((input) => input.includes("# 1. One"))!;
    const order = ["# 1. One", "# Extra slide", "# 2. Two"].map((heading) =>
      lessonDeck.indexOf(heading)
    );
    assert(
      order[0] < order[1] && order[1] < order[2],
      "inserted after section 1",
    );
    assertStringIncludes(lessonDeck, "- Extra deck");
    assert(
      captured.some((input) =>
        !input.includes("# 1. One") && input.includes("# Extra slide")
      ),
    );
    assert(lessonKey.length > 0);
  });
});

Deno.test("a linked slide deck is exported as a topic after the lesson's slides topic", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. One\n\n- a\n\n[Extra](../../decks/extra.md)\n",
    );
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\ntitle: Extra deck\n---\n\n# Extra slide\n",
    );
    await write(
      root,
      "content/week/lesson.html",
      "<html><body><h1>The lesson</h1></body></html>",
    );
    const exported = await exportSlidesToContent(
      { lessons: { "week/lesson.md": { generate: true } } },
      root,
      "lessons",
      "static",
      join(root, "content"),
      fake([]),
    );
    assertEquals(exported, [
      "week/lesson-slides.html",
      "week/lesson-slides-extra.html",
    ]);
    const topic = await Deno.readTextFile(
      join(root, "content/week/lesson-slides-extra.html"),
    );
    assertStringIncludes(topic, "Slides: The lesson — Extra deck");
  });
});

Deno.test("a slide deck that is both linked and configured is inserted at the link only", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. One\n\n- a\n\n[Extra](../../decks/extra.md)\n\n## 2. Two\n\n- b\n",
    );
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\n---\n\n# Extra slide\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      {
        lessons: { "week/lesson.md": { generate: true, decks: "decks/*.md" } },
      },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const lessonDeck = captured.find((input) => input.includes("# 1. One"))!;
    assertEquals(lessonDeck.match(/# Extra slide/g)?.length, 1);
  });
});

// Spec *Linked slide decks*, rule L8: only an existing file that is marked as a slide deck counts.
Deno.test("L8: a link to a missing file or to a plain page is not a deck: nothing is inserted or rendered", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. One\n\n- a\n\n[Missing](../../decks/missing.md)\n\n[Plain](plain.md)\n",
    );
    await write(
      root,
      "lessons/week/plain.md",
      "# Plain page\n\nNo front matter.\n",
    );
    const captured: string[] = [];
    const result = await renderPreviewSlides(
      { lessons: { "week/lesson.md": { generate: true } } },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertEquals(
      Object.keys(result).some((key) => key.startsWith(DECK_KEY_PREFIX)),
      false,
    );
    assertEquals(captured.length, 1);
    assert(!captured[0].includes("Plain page"));
  });
});

// Spec *Linked slide decks*, acceptance 7: a lesson without a generated slide deck still gets the standalone presentation.
Deno.test("acceptance 7: a lesson that links a slide deck but has no generated slide deck still gets the slide deck as a presentation", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\nSee [the deck](../../decks/extra.md).\n",
    );
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\n---\n\n# Extra slide\n",
    );
    const captured: string[] = [];
    const result = await renderPreviewSlides(
      { generateForPrefix: "nothing-" },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const deckKey = Object.keys(result).find((key) =>
      key.startsWith(DECK_KEY_PREFIX)
    );
    assert(deckKey?.endsWith("decks/extra.md"));
    assertEquals(captured.length, 1);
    assertStringIncludes(captured[0], "# Extra slide");
  });
});

// Spec *Slides on the lesson page in the cartridge*, rules B1 and B2.
Deno.test("B1/B2: an exported lesson page gets the markers and the script of the preview, and the slides are files that the menu does not list", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. One\n\n- a\n\n[Extra](../../decks/extra.md)\n",
    );
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\ntitle: Extra deck\n---\n\n# Extra slide\n",
    );
    await write(
      root,
      "content/week/lesson.html",
      "<html><body><h1>The lesson</h1><p>Text</p></body></html>",
    );
    await write(
      root,
      "content/week/plain.html",
      "<html><body><h1>No slides</h1></body></html>",
    );
    const exported = await exportSlidesToContent(
      { lessons: { "week/lesson.md": { generate: true } }, pptx: true },
      root,
      "lessons",
      "static",
      join(root, "content"),
      fake([]),
    );
    assertEquals(exported.sort(), [
      "week/lesson-slides-extra.html",
      "week/lesson-slides.html",
    ]);
    const page = await Deno.readTextFile(
      join(root, "content/week/lesson.html"),
    );
    // B1: the lesson presentation (Alt+T) and the extra deck (Alt+P and the button), as file names next to the lesson.
    assertStringIncludes(page, 'data-bso-slides="lesson-slides-extra.html"');
    assertStringIncludes(page, 'data-bso-slides-lesson="lesson-slides.html"');
    assertStringIncludes(page, "<script data-bso-slides-client>");
    // A page without slides is left as it is.
    assertEquals(
      await Deno.readTextFile(join(root, "content/week/plain.html")),
      "<html><body><h1>No slides</h1></body></html>",
    );
    // B2: the topics say that they are files for the lesson page, not menu items.
    for (const topic of exported) {
      assertStringIncludes(
        await Deno.readTextFile(join(root, "content", topic)),
        '<meta name="bso-hidden" content="slides">',
      );
    }
    // The dedicated deck has its pptx next to its topic.
    assert(
      (await Deno.stat(join(root, "content/week/lesson-slides-extra.pptx")))
        .isFile,
    );
  });
});

Deno.test("B5: without slides in the course the lesson page is not touched", async () => {
  await fixture(async (root) => {
    const page = "<html><body><h1>The lesson</h1></body></html>";
    await write(root, "content/week/lesson.html", page);
    assertEquals(
      await exportSlidesToContent(
        undefined,
        root,
        "lessons",
        "static",
        join(root, "content"),
        fake([]),
      ),
      [],
    );
    assertEquals(
      await Deno.readTextFile(join(root, "content/week/lesson.html")),
      page,
    );
  });
});

// Spec *Nested lesson pages*, rules N1, N3, N4, N7, N10.
async function overviewFixture(
  root: string,
  pages = ["a", "b"],
): Promise<void> {
  const links = pages.map((name) => `- [${name}](levels/level-${name}.md)`)
    .join("\n");
  await write(
    root,
    "lessons/week/overview.md",
    `# Overview\n\n## 1. Why\n\n- why\n\n## 2. The levels\n\n${links}\n\n- [Elsewhere](other/level-x.md)\n`,
  );
  for (const name of pages) {
    await write(
      root,
      `lessons/week/levels/level-${name}.md`,
      `# Level ${name}\n\n## 1. Goal\n\n- goal ${name}\n\n{@include: [part](../../partials/part.md)}\n`,
    );
  }
  await write(root, "lessons/partials/part.md", "- from the partial\n");
}

Deno.test("N1/N3/N4: nest gives the generated slides of the matching links, includes expanded one level", async () => {
  await fixture(async (root) => {
    await overviewFixture(root);
    await write(
      root,
      "lessons/week/other/level-x.md",
      "# Level x\n\n## 1. X\n\n- x\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      {
        lessons: {
          "week/overview.md": { generate: true, nest: ["levels/level-*.md"] },
        },
      },
      root,
      "lessons",
      "static",
      fake(captured),
    );
    const deck = captured[0];
    const order = [
      "# 2. The levels",
      "# 2.1 Level a",
      "goal a",
      "# 2.2 Level b",
      "goal b",
    ]
      .map((text) => deck.indexOf(text));
    assert(order.every((index) => index >= 0), `all present: ${order}`);
    assertEquals([...order].sort((x, y) => x - y), order);
    assertStringIncludes(deck, "- from the partial");
    assert(
      !deck.includes("# 2.3 Level x"),
      "a link that does not match nest stays a link",
    );
    assertStringIncludes(deck, "- [Elsewhere](other/level-x.md)");
  });
});

Deno.test("N7: a matching link to a missing file fails the build with the lesson, the link and the path", async () => {
  await fixture(async (root) => {
    await overviewFixture(root, ["a"]);
    await write(
      root,
      "lessons/week/overview.md",
      "# Overview\n\n## 1. Why\n\n- why\n\n## 2. Levels\n\n- [Gone](levels/level-gone.md)\n",
    );
    await assertRejects(
      () =>
        renderPreviewSlides(
          {
            lessons: {
              "week/overview.md": { generate: true, nest: "levels/level-*.md" },
            },
          },
          root,
          "lessons",
          "static",
          fake([]),
        ),
      Error,
      "level-gone.md",
    );
  });
});

Deno.test("N10: a change in a nested page shows at the next build, and the page stays its own slide deck", async () => {
  await fixture(async (root) => {
    await overviewFixture(root, ["a"]);
    const config: SlidesConfig = {
      lessons: {
        "week/overview.md": { generate: true, nest: ["levels/level-*.md"] },
        "week/levels/level-a.md": { generate: true },
      },
    };
    const first: string[] = [];
    const result = await renderPreviewSlides(
      config,
      root,
      "lessons",
      "static",
      fake(first),
    );
    assertStringIncludes(first.join("\n"), "goal a");
    // The lesson and the deck that it links.
    assertEquals(Object.keys(lessonsOnly(result)).length, 2);
    await write(
      root,
      "lessons/week/levels/level-a.md",
      "# Level a\n\n## 1. Goal\n\n- a changed goal\n",
    );
    const second: string[] = [];
    await renderPreviewSlides(config, root, "lessons", "static", fake(second));
    assert(
      second.every((input) =>
        !input.includes("goal a") || input.includes("a changed goal")
      ),
    );
    assertEquals(
      second.filter((input) => input.includes("a changed goal")).length,
      2,
    );
  });
});

// Spec *Slide images*, rules I7-I9 (ADR 025).
async function widePng(width: number, height: number): Promise<Uint8Array> {
  const { Buffer } = await import("node:buffer");
  const pngjs = (await import("pngjs")).default;
  const image = new pngjs.PNG({ width, height });
  const data = new Uint8Array(width * height * 4);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = i % 4 === 3 ? 255 : (seed >> 16) & 255;
  }
  image.data = Buffer.from(data);
  return new Uint8Array(pngjs.PNG.sync.write(image));
}

Deno.test("I7/I8: the copy of a wide image in the slides is shrunk to slides.maxImageWidth, the source stays, and 0 turns it off", async () => {
  const source = await widePng(1800, 20);
  const widthIn = (markdown: string): number => {
    const match = markdown.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
    const bytes = Uint8Array.from(atob(match![1]), (c) => c.charCodeAt(0));
    return new DataView(bytes.buffer).getUint32(16);
  };
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. Picture\n\n![Wide](wide.png)\n",
    );
    await Deno.writeFile(join(root, "lessons/week/wide.png"), source);
    const run = async (maxImageWidth?: number) => {
      const captured: string[] = [];
      await renderPreviewSlides(
        {
          lessons: { "week/lesson.md": { generate: true } },
          ...(maxImageWidth === undefined ? {} : { maxImageWidth }),
        },
        root,
        "lessons",
        "static",
        fake(captured),
      );
      return widthIn(captured[0]);
    };
    // The default is 1600; a setting changes it; 0 keeps the image as it is.
    assertEquals(await run(), 1600);
    assertEquals(await run(500), 500);
    assertEquals(await run(0), 1800);
    // The source image is never changed.
    assertEquals(
      await Deno.readFile(join(root, "lessons/week/wide.png")),
      source,
    );
  });
});

Deno.test("I9: slides.maxImageWidth is a whole number of pixels or 0", () => {
  const base = { courseName: "C", version: "1", sourcesDir: "lessons" };
  validateConfig({
    ...base,
    slides: { generateForPrefix: "x", maxImageWidth: 1200 },
  });
  validateConfig({
    ...base,
    slides: { generateForPrefix: "x", maxImageWidth: 0 },
  });
  for (const bad of [-1, 1.5, "1600"]) {
    assertThrows(
      () =>
        validateConfig({
          ...base,
          slides: { generateForPrefix: "x", maxImageWidth: bad },
        }),
      Error,
      "slides.maxImageWidth",
    );
  }
});

// Spec *The lesson as slides: Alt+T*, rule T1.
Deno.test("T1: only a lesson whose deck is generated from the lesson gets a lesson entry", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/generated.md",
      "# Generated\n\n## 1. One\n\n- a\n",
    );
    await write(root, "lessons/week/extra.md", "# Extra\n\nText.\n");
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\n---\n\n# Extra slide\n",
    );
    const result = await renderPreviewSlides(
      {
        lessons: {
          "week/generated.md": { generate: true },
          "week/extra.md": { decks: "decks/extra.md" },
        },
      },
      root,
      "lessons",
      "static",
      fake([]),
    );
    const generated = Object.keys(result).find((key) =>
      key.endsWith("generated.md") && !key.startsWith(LESSON_KEY_PREFIX)
    )!;
    const extra = Object.keys(result).find((key) =>
      key.endsWith("week/extra.md") && !key.startsWith(LESSON_KEY_PREFIX)
    )!;
    assertEquals(result[LESSON_KEY_PREFIX + generated], result[generated]);
    assertEquals(result[LESSON_KEY_PREFIX + extra], undefined);
    assert(
      result[extra] !== undefined,
      "the extra slides still have their deck",
    );
  });
});

// Spec *Editable PowerPoint*, rule X3: the file is named after the lesson file.
Deno.test("X3: the pptx of a generated deck is named after the lesson file, also in the cartridge", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson-1-fizz.md",
      "# Lesson\n\n## 1. One\n\n- a\n",
    );
    await write(
      root,
      "content/week/lesson-1-fizz.html",
      "<html><body><h1>Lesson</h1></body></html>",
    );
    await exportSlidesToContent(
      { lessons: { "week/lesson-1-fizz.md": { generate: true, pptx: true } } },
      root,
      "lessons",
      "static",
      join(root, "content"),
      fake([]),
    );
    const staticDir = join(root, "static", "slides", "week", "lesson-1-fizz");
    assert((await Deno.stat(join(staticDir, "lesson-1-fizz.pptx"))).isFile);
    assert(
      (await Deno.stat(join(root, "content", "week", "lesson-1-fizz.pptx")))
        .isFile,
    );
    const page = await Deno.readTextFile(
      join(root, "content", "week", "lesson-1-fizz.html"),
    );
    assert(
      !page.includes("lesson-1-fizz.pptx"),
      "no download link on the lesson page",
    );
  });
});

// Spec *The lesson as slides: Alt+T*, rule T1.
Deno.test("T1: a generated lesson that links a deck gets that deck as its extra slides", async () => {
  await fixture(async (root) => {
    await write(
      root,
      "lessons/week/lesson.md",
      "# Lesson\n\n## 1. One\n\n- a\n\n[Extra](../../decks/extra.md)\n",
    );
    await write(root, "lessons/week/plain.md", "# Plain\n\n## 1. One\n\n- a\n");
    await write(
      root,
      "decks/extra.md",
      "---\nslides: true\n---\n\n# Extra slide\n",
    );
    const result = await renderPreviewSlides(
      {
        lessons: {
          "week/lesson.md": { generate: true },
          "week/plain.md": { generate: true },
        },
      },
      root,
      "lessons",
      "static",
      fake([]),
    );
    const key = (name: string) =>
      Object.keys(result).find((each) =>
        each.endsWith(name) && !each.includes(":")
      )!;
    const deck = Object.keys(result).find((each) =>
      each.startsWith(DECK_KEY_PREFIX)
    )!;
    assertEquals(
      result[EXTRA_KEY_PREFIX + key("week/lesson.md")],
      result[deck],
    );
    assertEquals(result[EXTRA_KEY_PREFIX + key("week/plain.md")], undefined);
  });
});

// Spec *Title prefix*, rule TP4: the pptx and the HTML of a deck do not have the prefix.
Deno.test("TP4: slides.titlePrefix is left out of the titles in the HTML input and in the pptx", async () => {
  await fixture(async (root) => {
    await write(root, "lessons/week/lesson.md", "# Lesson\n\nText.\n");
    await write(
      root,
      "decks/les.md",
      "---\nslides: true\ntitle: Les\n---\n\n# Slide 1 - Start\n\n- one\n\n---\n\n## Slide 2 - Standup\n\n- two\n",
    );
    const captured: string[] = [];
    await renderPreviewSlides(
      {
        lessons: { "week/lesson.md": { decks: "decks/les.md", pptx: true } },
        pptx: true,
        titlePrefix: "Slide \\d+ - ",
      } as SlidesConfig,
      root,
      "lessons",
      "static",
      fake(captured),
    );
    assertStringIncludes(captured[0], "# Start");
    assertStringIncludes(captured[0], "## Standup");
    assert(!captured[0].includes("Slide 1 - "));
    const zip = await JSZip.loadAsync(
      await Deno.readFile(join(root, "static/slides/week/lesson/les.pptx")),
    );
    const text = (await Promise.all(
      Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(name)
      ).map((name) => zip.file(name)!.async("string")),
    )).join("\n");
    assertStringIncludes(text, "Standup");
    assert(!text.includes("Slide 2 - "));
  });
});
