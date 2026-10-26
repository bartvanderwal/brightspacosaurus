import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, join, resolve } from "@std/path";
import {
  deckMarkerConflict,
  deckProblem,
  expandIncludesOnce,
  type IncludeHost,
  isSlideDeck,
} from "../src/includes.ts";
import { lintMarkdown } from "../src/course-linter.ts";
import { renderPreviewSlides } from "../src/slides-preview.ts";

function host(
  files: Record<string, string>,
  warnings: string[] = [],
): IncludeHost {
  return {
    resolve: (fromDir, target) => `${fromDir}/${target}`.replace("//", "/"),
    dirname: (path) => path.slice(0, path.lastIndexOf("/")) || "/",
    readFile: (path) => files[path] ?? null,
    warn: (message) => warnings.push(message),
  };
}

Deno.test("expandIncludesOnce places the file as it is and leaves a nested include alone", () => {
  const files = {
    "/c/a.md": "---\nslides: true\n---\n# From A\n\n{@include: [B](b.md)}\n",
    "/c/b.md": "# From B\n",
  };
  const out = expandIncludesOnce(
    "Intro\n\n{@include: [A](a.md)}\n\nEnd",
    "/c",
    host(files),
  );
  // front matter dropped, A's own include is not expanded
  assertEquals(out, "Intro\n\n# From A\n\n{@include: [B](b.md)}\n\nEnd");
});

Deno.test("expandIncludesOnce reports a missing file and keeps the line", () => {
  const warnings: string[] = [];
  const out = expandIncludesOnce(
    "{@include: [X](missing.md)}",
    "/c",
    host({}, warnings),
  );
  assertEquals(out, "{@include: [X](missing.md)}");
  assertEquals(warnings.length, 1);
});

Deno.test("two files that include each other expand once, without a loop", () => {
  const files = {
    "/c/a.md": "A\n{@include: [B](b.md)}",
    "/c/b.md": "B\n{@include: [A](a.md)}",
  };
  assertEquals(
    expandIncludesOnce("{@include: [A](a.md)}", "/c", host(files)),
    "A\n{@include: [B](b.md)}",
  );
});

Deno.test("isSlideDeck needs slides: true or marp: true in the front matter", () => {
  assert(isSlideDeck("---\nslides: true\n---\n# A"));
  assert(isSlideDeck("---\nmarp: true\ntheme: x\n---\n# A"));
  assert(!isSlideDeck("---\nslides: false\n---\n# A"));
  assert(!isSlideDeck("# no front matter"));
});

Deno.test("generated slides take an include one level deep, with image paths relative to the lesson", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "slide-include-",
  });
  try {
    const put = async (path: string, text: string) => {
      await Deno.mkdir(dirname(join(root, path)), { recursive: true });
      await Deno.writeTextFile(join(root, path), text);
    };
    await put(
      "lessons/week/lesson.md",
      "# Lesson\n\n## Goals\n\n{@include: [Goals](../../partials/goals.md)}\n",
    );
    await put(
      "partials/goals.md",
      "- goal one\n- goal two\n\n{@include: [Deeper](deeper.md)}\n",
    );
    await put("partials/deeper.md", "- never shown\n");
    const captured: string[] = [];
    await renderPreviewSlides(
      { lessons: { "week/lesson.md": { generate: true } } },
      root,
      "lessons",
      "static",
      async (args) => {
        if (args[0] === "install") {
          const tools = args[2];
          const w = async (p: string, t: string) => {
            await Deno.mkdir(dirname(join(tools, p)), { recursive: true });
            await Deno.writeTextFile(join(tools, p), t);
          };
          await w(
            "node_modules/@marp-team/marp-cli/package.json",
            '{"version":"4.5.1"}',
          );
          await w(
            "node_modules/@xmldom/xmldom/package.json",
            '{"version":"0.9.12"}',
          );
          await w("node_modules/katex/package.json", '{"version":"0.18.2"}');
          await w(
            "package-lock.json",
            JSON.stringify({
              packages: {
                "node_modules/@marp-team/marp-cli": { version: "4.5.1" },
                "node_modules/@xmldom/xmldom": { version: "0.9.12" },
                "node_modules/katex": { version: "0.18.2" },
              },
            }),
          );
          return;
        }
        captured.push(await Deno.readTextFile(args[args.indexOf("marp") + 1]));
        await Deno.writeTextFile(
          args[args.indexOf("--output") + 1],
          "<html><head></head><body></body></html>",
        );
      },
    );
    assertStringIncludes(captured[0], "- goal one");
    assertStringIncludes(captured[0], "goal two");
    assert(!captured[0].includes("never shown"));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("bso lint flags a nested include in a slide deck only through lintCourse inputs; a plain slide deck gives none", () => {
  const deck = "---\nslides: true\n---\n# A\n\n{@include: [B](b.md)}\n";
  assertEquals(
    lintMarkdown(deck, "deck.md").filter((d) =>
      d.rule === "slides-nested-include"
    ),
    [],
  );
});

Deno.test("deckProblem says why a file is not a slide deck, and deckMarkerConflict only for slides plus marp", () => {
  assertEquals(deckProblem("---\nslides: true\n---\n# A"), undefined);
  assertEquals(deckProblem("---\nmarp: true # on\n---\n# A"), undefined);
  assertStringIncludes(
    deckProblem("# No front matter") ?? "",
    "no front matter",
  );
  assertStringIncludes(
    deckProblem("---\ntitle: x\n---\n# A") ?? "",
    "neither",
  );
  assertStringIncludes(
    deckProblem("---\nslides: true\nmarp: true\n---\n# A") ?? "",
    "more than one",
  );
  assertStringIncludes(
    deckProblem('---\nslides: "true"\n---\n# A') ?? "",
    "unquoted value true",
  );
  assertStringIncludes(
    deckProblem("---\nslides: true\nnot yaml at all\n---\n# A") ?? "",
    "malformed",
  );
  assertEquals(
    deckMarkerConflict("---\nslides: true\nmarp: true\n---\n"),
    true,
  );
  assertEquals(
    deckMarkerConflict("---\nmarp: true\nmarp: false\n---\n"),
    false,
  );
  assertEquals(deckMarkerConflict("# No front matter"), false);
});
