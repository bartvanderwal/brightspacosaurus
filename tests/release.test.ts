/**
 * Tests for the release checks (ADR 018).
 */
import { assertEquals } from "@std/assert";
import { releaseProblems, type ReleaseState } from "../utils/release.ts";

const ok: ReleaseState = {
  version: "1.2.3",
  branch: "main",
  dirty: false,
  tagCommit: "abc1234",
  head: "abc1234",
  pushed: true,
};

Deno.test("releaseProblems accepts a clean, tagged, pushed main", () => {
  assertEquals(releaseProblems(ok), []);
});

Deno.test("releaseProblems names the fix for each problem", () => {
  const problems = releaseProblems({
    ...ok,
    branch: "feature/x",
    dirty: true,
    tagCommit: undefined,
    pushed: false,
  });
  assertEquals(problems.length, 4);
  assertEquals(problems.some((p) => p.includes("git tag v1.2.3")), true);
  assertEquals(problems.some((p) => p.includes("git push")), true);
  assertEquals(problems.some((p) => p.includes("git switch main")), true);
});

Deno.test("releaseProblems rejects a tag that is not on HEAD", () => {
  const problems = releaseProblems({ ...ok, tagCommit: "def5678" });
  assertEquals(problems.length, 1);
  assertEquals(problems[0].includes("not to HEAD"), true);
});
