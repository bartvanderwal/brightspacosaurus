/**
 * One command for the whole release (`deno task release`): checks that the
 * working tree, branch and tag are in order (ADR 018), publishes to JSR with
 * `deno publish`, and then publishes to npm with `deno task release:npm`.
 *
 * `--dry-run` passes through to both publish steps.
 *
 * @module
 */

/** What the release checks need to know about the repository. */
export interface ReleaseState {
  version: string;
  branch: string;
  dirty: boolean;
  /** Commit the tag `v<version>` points to, or undefined when it is missing. */
  tagCommit?: string;
  head: string;
  /** True when `origin/main` contains HEAD. */
  pushed: boolean;
}

/**
 * Returns what stops a release, each with the command that fixes it.
 * Pure function: no git calls, for easy testing.
 */
export function releaseProblems(state: ReleaseState): string[] {
  const problems: string[] = [];
  const tag = `v${state.version}`;
  if (state.branch !== "main") {
    problems.push(
      `On branch '${state.branch}', release from 'main': git switch main`,
    );
  }
  if (state.dirty) {
    problems.push("Working tree has changes: commit or stash them first.");
  }
  if (!state.tagCommit) {
    problems.push(
      `Tag ${tag} does not exist: git tag ${tag} (version comes from deno.json).`,
    );
  } else if (state.tagCommit !== state.head) {
    problems.push(
      `Tag ${tag} points to ${state.tagCommit.slice(0, 7)}, not to HEAD ` +
        `(${state.head.slice(0, 7)}): release from the tagged commit.`,
    );
  }
  if (!state.pushed) {
    problems.push("HEAD is not on origin/main: git push origin main --tags");
  }
  return problems;
}

async function git(...args: string[]): Promise<string> {
  const output = await new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "null",
  }).output();
  return output.code === 0
    ? new TextDecoder().decode(output.stdout).trim()
    : "";
}

async function step(args: string[]): Promise<void> {
  console.log(`\n> deno ${args.join(" ")}`);
  const { code } = await new Deno.Command("deno", {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (code !== 0) {
    console.error(`Step failed (exit ${code}); release stopped.`);
    Deno.exit(code);
  }
}

if (import.meta.main) {
  const dryRun = Deno.args.includes("--dry-run");
  const version = JSON.parse(await Deno.readTextFile("deno.json")).version;
  const head = await git("rev-parse", "HEAD");
  const problems = releaseProblems({
    version,
    head,
    branch: await git("branch", "--show-current"),
    dirty: (await git("status", "--porcelain")) !== "",
    tagCommit:
      (await git("rev-parse", "--verify", "-q", `v${version}^{commit}`)) ||
      undefined,
    pushed: (await git("branch", "-r", "--contains", head))
      .split("\n").some((line) => line.trim() === "origin/main"),
  });
  if (problems.length) {
    console.error(`Cannot release ${version}:`);
    for (const problem of problems) console.error(`- ${problem}`);
    Deno.exit(1);
  }
  console.log(`Releasing ${version}${dryRun ? " (dry run)" : ""}`);
  await step(["publish", ...(dryRun ? ["--dry-run"] : [])]);
  await step(["task", "release:npm", ...(dryRun ? ["--dry-run"] : [])]);
  console.log(`\nReleased ${version} to JSR and npm.`);
}
