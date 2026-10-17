import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const testDir = dirname(fromFileUrl(import.meta.url));
const filterPath = join(testDir, "..", "assets", "details-filter.lua");

async function runPandoc(markdown: string, to: string): Promise<string> {
  const result = await new Deno.Command("pandoc", {
    args: ["--from=markdown", `--to=${to}`, `--lua-filter=${filterPath}`],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = result.stdin.getWriter();
  await writer.write(new TextEncoder().encode(markdown));
  await writer.close();
  const output = await result.output();
  assertEquals(output.success, true, new TextDecoder().decode(output.stderr));
  return new TextDecoder().decode(output.stdout);
}

const permissions = { run: true };

Deno.test({
  name:
    "details-filter shows the summary in bold and keeps the content in print",
  permissions,
  async fn() {
    const latex = await runPandoc(
      'WAT.\n\n<details>\n<summary>How to set it up</summary>\n\n```json\n{ "a": 1 }\n```\n\nMore HOE.\n\n</details>\n',
      "latex",
    );
    assertStringIncludes(latex, "\\textbf{How to set it up}");
    assertStringIncludes(latex, "More HOE.");
    assertStringIncludes(latex, "Shaded");
    assertEquals(latex.includes("<details"), false);
    assertEquals(latex.includes("<summary"), false);
  },
});

Deno.test({
  name: "details-filter handles a summary written on one line with text",
  permissions,
  async fn() {
    const latex = await runPandoc(
      "<details><summary>One line</summary>\n\nBody text.\n\n</details>\n",
      "latex",
    );
    assertStringIncludes(latex, "\\textbf{One line}");
    assertStringIncludes(latex, "Body text.");
  },
});

Deno.test({
  name: "details-filter leaves HTML output with its collapsible block",
  permissions,
  async fn() {
    const html = await runPandoc(
      "<details>\n<summary>How</summary>\n\nBody.\n\n</details>\n",
      "html",
    );
    assertStringIncludes(html, "<details>");
    assertStringIncludes(html, "<summary>");
  },
});
