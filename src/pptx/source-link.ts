import { relative } from "@std/path";

export function repositorySourceUrl(
  remote: string,
  commit: string,
  path: string,
): string | undefined {
  if (!/^[a-f\d]{40,64}$/.test(commit) || path.split(/[\\/]/).includes("..")) {
    return undefined;
  }
  const normalized = remote.replace(/^git@([^:]+):/, "https://$1/").replace(
    /\.git$/,
    "",
  );
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return undefined;
  }
  if (!["http:", "https:"].includes(url.protocol)) return undefined;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const kind = url.hostname === "github.com"
    ? "/blob/"
    : /(^|\.)gitlab[.-]/.test(url.hostname)
    ? "/-/blob/"
    : undefined;
  if (!kind) return undefined;
  return `${url.href.replace(/\/$/, "")}${kind}${commit}/${
    path.split(/[\\/]/).map(encodeURIComponent).join("/")
  }`;
}

export async function sourceLink(
  root: string,
  source: string,
): Promise<string | undefined> {
  const git = async (args: string[]) => {
    const result = await new Deno.Command("git", {
      args,
      cwd: root,
      stdout: "piped",
      stderr: "piped",
    }).output();
    return result.success
      ? new TextDecoder().decode(result.stdout).trim()
      : undefined;
  };
  const remote = await git(["remote", "get-url", "origin"]);
  const commit = await git(["rev-parse", "HEAD"]);
  const path = relative(root, source).replaceAll("\\", "/");
  if (
    !remote || !commit ||
    await git(["cat-file", "-e", `${commit}:${path}`]) === undefined
  ) {
    return undefined;
  }
  return repositorySourceUrl(remote, commit, path);
}
