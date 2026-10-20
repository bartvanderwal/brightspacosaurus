import { assert, assertEquals, assertMatch } from "@std/assert";

const skillsDir = new URL("../skills/", import.meta.url);

Deno.test(
  "each BSO authoring skill has valid matching English metadata",
  async () => {
    const entries: string[] = [];
    for await (const entry of Deno.readDir(skillsDir)) {
      if (entry.isDirectory) entries.push(entry.name);
    }
    entries.sort();
    assertEquals(entries.length, 10);

    for (const name of entries) {
      const skill = await Deno.readTextFile(
        new URL(`${name}/SKILL.md`, skillsDir),
      );
      const match = skill.match(
        /^---\nname: ([a-z0-9-]+)\ndescription: "(.+)"\n---\n/m,
      );
      assert(
        match,
        `${name}/SKILL.md must start with name and description frontmatter`,
      );
      assertEquals(match[1], name, `${name}: name must match its directory`);
      const description = match[2];
      assert(description.length >= 1 && description.length <= 1024);
      assert(!/\bGebruik\b/i.test(description), `${name}: metadata must be English`);
      assertMatch(skill, /Minimum verified BSO version: \*\*0\.29\.0\*\*/);
      assertMatch(skill, /Validate|validation/i);
      assertMatch(
        skill,
        /Respond in the user's language|answer in the user's language/i,
      );
    }
  },
);

Deno.test(
  "skill Markdown links resolve and no workflow depends on a nearby checkout",
  async () => {
    for await (const entry of Deno.readDir(skillsDir)) {
      if (!entry.isDirectory) continue;
      const fileUrl = new URL(`${entry.name}/SKILL.md`, skillsDir);
      const content = await Deno.readTextFile(fileUrl);
      const prose = content.replace(/```[\s\S]*?```/g, "").replace(
        /`[^`]*`/g,
        "",
      );
      assertEquals(
        [...prose.matchAll(/\]\(([^)]+)\)/g)].filter(([, target]) =>
          !/^(https?:|#)/.test(target)
        ).length,
        0,
        `${entry.name}: references should not rely on the repository checkout`,
      );
      assert(!/brightspacosaurus\/(?:src|assets)\//i.test(content));
    }
  },
);

Deno.test(
  "install and configuration examples point to real skills and valid JSON",
  async () => {
    const readme = await Deno.readTextFile(new URL("README.md", skillsDir));
    const installCommand = readme.match(
      /```sh\n(npx skills add [^\n]+)\n```/,
    );
    assert(
      installCommand,
      "README must show a selected-skill installation example",
    );
    const args = installCommand[1].split(" ");
    assertEquals(args.slice(0, 3), ["npx", "skills", "add"]);
    assertEquals(args[3], "bartvanderwal/brightspacosaurus");
    const skillFlag = args.indexOf("--skill");
    const agentFlag = args.indexOf("--agent");
    assert(skillFlag > 0 && agentFlag > skillFlag);
    assertEquals(args.slice(agentFlag), ["--agent", "github-copilot"]);
    for (const name of args.slice(skillFlag + 1, agentFlag)) {
      assert(
        await Deno.stat(new URL(`${name}/SKILL.md`, skillsDir)),
        `${name} in the install example must exist`,
      );
    }
    assertMatch(readme, /tree\/<tag-or-commit>\/skills/);

    const setup = await Deno.readTextFile(
      new URL("bso-course-setup/SKILL.md", skillsDir),
    );
    const config = setup.match(/```json\n([\s\S]*?)\n[ \t]*```/);
    assert(config, "course setup must include a config example");
    const parsed = JSON.parse(config[1]);
    assertEquals(parsed.sourcesDir, "lessons/");
    assertEquals(typeof parsed.courseName, "string");
    assertEquals(typeof parsed.version, "string");
  },
);

Deno.test("course setup and quiz skills fit the demo client", async () => {
  const demo = new URL("../examples/demo-course/", import.meta.url);
  const config = JSON.parse(
    await Deno.readTextFile(new URL("brightspacosaurus.config.json", demo)),
  );
  assertEquals(config.sourcesDir, "lessons/");
  assertEquals(config.readersDir, "readers/");
  assert(await Deno.stat(new URL(config.docusaurusDir, demo)));

  const readerFiles: string[] = [];
  for await (const entry of Deno.readDir(new URL(config.readersDir, demo))) {
    if (
      entry.isFile && entry.name.startsWith("reader-") &&
      entry.name.endsWith(".md")
    ) {
      readerFiles.push(entry.name);
    }
  }
  assert(readerFiles.length > 0, "demo client should have a reader source");

  const quiz = await Deno.readTextFile(
    new URL("lessons/week-2/quiz-5-assignments.md", demo),
  );
  assertMatch(quiz, /^````quiz$/m);
  assertMatch(quiz, /^@ Testing FizzBuzz$/m);
  assertMatch(quiz, /^\? Which test is useful and working\?/m);
  assertMatch(quiz, /^= Buzz ~10$/m);
});

Deno.test("privacy boundaries are explicit", async () => {
  const issues = await Deno.readTextFile(
    new URL("bso-assignment-issues/SKILL.md", skillsDir),
  );
  assertMatch(issues, /schema.*verified|schema.*verify/i);
  assertMatch(issues, /Never send student data/i);

  const dashboard = await Deno.readTextFile(
    new URL("bso-progress-dashboard/SKILL.md", skillsDir),
  );
  assertMatch(dashboard, /Never write tokens/i);
  assertMatch(dashboard, /local cache contains student identifiers/i);
});

Deno.test("content authoring explains how to start a course lesson", async () => {
  const authoring = await Deno.readTextFile(
    new URL("bso-content-authoring/SKILL.md", skillsDir),
  );
  assertMatch(authoring, /course outline, learner level, learning outcomes/);
  assertMatch(authoring, /configured `sourcesDir`/);
  assertMatch(authoring, /lessons\/01-foundations\//);
  assertMatch(authoring, /each lesson in its own Markdown file/);
});
