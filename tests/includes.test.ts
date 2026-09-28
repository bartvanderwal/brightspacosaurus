import { assertEquals, assertThrows } from "@std/assert";
import { dirname, join } from "@std/path";
import { expandIncludes, type IncludeHost } from "../src/includes.ts";

function memoryHost(files: Record<string, string>, warnings: string[] = []) {
  const host: IncludeHost = {
    resolve: join,
    dirname,
    readFile: (path) => files[path] ?? null,
    warn: (message) => warnings.push(message),
  };
  return host;
}

Deno.test("expandIncludes replaces a directive line with file content", () => {
  const host = memoryHost({ "/c/partials/goals.md": "## Goals\n\n- one" });
  const out = expandIncludes(
    "Intro\n{@include: [Goals](../partials/goals.md)}\nOutro",
    "/c/lessons",
    host,
  );
  assertEquals(out, "Intro\n## Goals\n\n- one\nOutro");
});

Deno.test("expandIncludes resolves nested includes relative to each file", () => {
  const host = memoryHost({
    "/c/a/one.md": "one\n{@include: [two](sub/two.md)}",
    "/c/a/sub/two.md": "two",
  });
  assertEquals(
    expandIncludes("{@include: [one](a/one.md)}", "/c", host),
    "one\ntwo",
  );
});

Deno.test("expandIncludes keeps missing includes and warns", () => {
  const warnings: string[] = [];
  const line = "{@include: [x](missing.md)}";
  assertEquals(expandIncludes(line, "/c", memoryHost({}, warnings)), line);
  assertEquals(warnings, ["resolveIncludes: file not found: /c/missing.md"]);
});

Deno.test("expandIncludes stops at depth 10 for cyclic includes", () => {
  const host = memoryHost({ "/c/self.md": "{@include: [self](self.md)}" });
  assertEquals(
    expandIncludes("{@include: [self](self.md)}", "/c", host),
    "{@include: [self](self.md)}",
  );
});

Deno.test("expandIncludes rejects non-link directive syntax", () => {
  assertThrows(
    () => expandIncludes("{@include: goals.md}", "/c", memoryHost({})),
    Error,
    "requires Markdown link syntax",
  );
});

Deno.test("expandIncludes ignores directives that are not on their own line", () => {
  const md = "See {@include: [x](x.md)} inline";
  assertEquals(expandIncludes(md, "/c", memoryHost({ "/c/x.md": "X" })), md);
});
