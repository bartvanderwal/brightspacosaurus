import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { dirname, join, resolve } from "@std/path";
import {
  renderPreviewSlides,
  type SlidesConfig,
  type SlidesRunner,
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
      "<html><head></head><body><section>Slide</section><!-- Notes --></body></html>",
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
    assertEquals(map, {
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
      'section::before{content:"In ontwikkeling voor 2026/2027, periode 3"',
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

Deno.test("slides preview: only top-level true frontmatter selects decks", async () => {
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
      "\uFEFF---\r\nmarp: true # enabled\r\n---\r\n# Yes",
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
    assertEquals(captured[0].match(/data:image\/svg\+xml;base64,/g)?.length, 2);
    assertEquals(captured[0].match(/bso-embedded-svg-0\.svg/g)?.length, 2);
    assertStringIncludes(captured[0], "![bg](<data:");
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
    assert(!html.includes("<script>"));
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
    const redUrl = `data:image/svg+xml;base64,${btoa(red)}`;
    const blueUrl = "bso-embedded-svg-0.svg";
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

Deno.test("slides preview: symlink decks are skipped, asset and output escapes rejected", async () => {
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

Deno.test("slides preview: renderer failures name lesson and decks, temporary input is removed", async () => {
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
