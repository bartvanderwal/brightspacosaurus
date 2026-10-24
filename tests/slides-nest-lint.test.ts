import { assertEquals, assertStringIncludes } from "@std/assert";
import { join, resolve } from "@std/path";
import { resolveConfig } from "../src/config-loader.ts";
import { lintCourse } from "../src/course-linter.ts";

// Spec *Nested lesson pages*, rules N8 and N9.
async function lintNest(
  overview: string,
  pages: string[],
  nest: string[],
): Promise<{ rule: string; line: number; message: string }[]> {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "nest-lint-",
  });
  try {
    await Deno.mkdir(join(root, "lessons/week/levels"), { recursive: true });
    await Deno.writeTextFile(join(root, "lessons/week/overview.md"), overview);
    for (const name of pages) {
      await Deno.writeTextFile(
        join(root, `lessons/week/levels/${name}.md`),
        `# ${name}\n\n## 1. Goal\n\n- goal\n`,
      );
    }
    const config = resolveConfig(
      {
        courseName: "Demo",
        version: "1.0.0",
        sourcesDir: "lessons",
        slides: { lessons: { "week/overview.md": { generate: true, nest } } },
      },
      {},
      root,
    );
    const result = await lintCourse(config);
    return result.diagnostics.filter((d) =>
      d.rule.startsWith("slides-nest") || d.rule === "slides-too-many-nested"
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

const list = (names: string[]) =>
  names.map((name) => `- [${name}](levels/${name}.md)`).join("\n");

Deno.test("N9: a nest pattern that matches no link of the lesson is reported", async () => {
  const found = await lintNest(
    `# Overview\n\n## 1. Levels\n\n${list(["level-a"])}\n`,
    ["level-a"],
    ["levels/typo-*.md"],
  );
  assertEquals(found.map((d) => d.rule), ["slides-nest-unused"]);
  assertStringIncludes(found[0].message, "levels/typo-*.md");
});

Deno.test("N8: more than 9 nested pages in one section is reported, 9 is not", async () => {
  const nine = Array.from({ length: 9 }, (_, i) => `level-${i + 1}`);
  const ten = [...nine, "level-10"];
  const overview = (names: string[]) =>
    `# Overview\n\n## 1. Levels\n\n${list(names)}\n`;
  assertEquals(await lintNest(overview(nine), nine, ["levels/level-*.md"]), []);
  const found = await lintNest(overview(ten), ten, ["levels/level-*.md"]);
  assertEquals(found.map((d) => d.rule), ["slides-too-many-nested"]);
  assertEquals(found[0].line, 14);
});

Deno.test("N8: the count is per section, not per lesson", async () => {
  const names = Array.from({ length: 12 }, (_, i) => `level-${i + 1}`);
  const overview = `# Overview\n\n## 1. One\n\n${
    list(names.slice(0, 6))
  }\n\n## 2. Two\n\n${list(names.slice(6))}\n`;
  assertEquals(await lintNest(overview, names, ["levels/level-*.md"]), []);
});
