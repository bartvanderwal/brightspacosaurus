/**
 * Tests for --output parameter and project name fallback in pack command.
 *
 * Validates:
 * - --output bare name → build/<name>.v<version>.imscc (unchanged behaviour)
 * - --output with path → .imscc in that directory, buildDir derived from it
 * - Folder name used as fallback when no --output and no config name
 * - Config name (rcName) overrides packageName fallback
 */

import { assertEquals } from "@std/assert";
import { join, basename, dirname } from "@std/path";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mirrors the resolveBuildDir + outputPath logic from main.ts.
 * Keeps tests as pure functions (no subprocess).
 */
function resolveBuildDir(repoRoot: string, output: string): string {
  const withoutExt = output.endsWith(".imscc") ? output.slice(0, -6) : output;
  if (withoutExt && (withoutExt.includes("/") || withoutExt.startsWith("/"))) {
    const absOutput = withoutExt.startsWith("/") ? withoutExt : join(repoRoot, withoutExt);
    return join(dirname(absOutput), "brightspace");
  }
  return join(repoRoot, "build", "brightspace");
}

function resolveOutputPath(opts: {
  repoRoot: string;
  output: string;
  version: string;
  packageName: string;
  rcName?: string;
}): string {
  const { repoRoot, output, version, packageName, rcName } = opts;
  const buildDir = resolveBuildDir(repoRoot, output);

  if (output) {
    if (output.endsWith(".imscc")) {
      return output.startsWith("/") ? output : join(repoRoot, output);
    }
    const outputName = basename(output);
    return join(dirname(buildDir), `${outputName}.v${version}.imscc`);
  }

  const projectName = rcName || packageName || basename(repoRoot);
  return join(dirname(buildDir), `${projectName}.v${version}.imscc`);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

Deno.test("--output: bare name → build/<name>.v<version>.imscc", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "my-course",
    version: "1.2.3",
    packageName: "ignored",
  });
  assertEquals(result, "/repo/build/my-course.v1.2.3.imscc");
});

Deno.test("--output: path with slash → .imscc in that directory", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "oose-dt/build/OOSE-DT-SAD",
    version: "0.2.1",
    packageName: "ignored",
  });
  assertEquals(result, "/repo/oose-dt/build/OOSE-DT-SAD.v0.2.1.imscc");
});

Deno.test("--output: full .imscc path → used as-is (absolute)", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "/other/path/course.imscc",
    version: "1.0.0",
    packageName: "ignored",
  });
  assertEquals(result, "/other/path/course.imscc");
});

Deno.test("--output: relative .imscc path → prefixed with repoRoot", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "dist/course.imscc",
    version: "1.0.0",
    packageName: "ignored",
  });
  assertEquals(result, "/repo/dist/course.imscc");
});

Deno.test("no --output: falls back to config name", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "",
    version: "2.0.0",
    packageName: "my-project",
  });
  assertEquals(result, "/repo/build/my-project.v2.0.0.imscc");
});

Deno.test("no --output: rcName (config name) overrides packageName fallback", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "",
    version: "2.0.0",
    packageName: "package-name",
    rcName: "rc-name",
  });
  assertEquals(result, "/repo/build/rc-name.v2.0.0.imscc");
});

Deno.test("no --output, no package name: falls back to folder name", () => {
  const result = resolveOutputPath({
    repoRoot: "/projects/my-repo",
    output: "",
    version: "0.1.0",
    packageName: "",
  });
  assertEquals(result, "/projects/my-repo/build/my-repo.v0.1.0.imscc");
});

Deno.test("--output: empty string → falls back to config name", () => {
  const result = resolveOutputPath({
    repoRoot: "/repo",
    output: "",
    version: "1.0.0",
    packageName: "owe-1",
  });
  assertEquals(result, "/repo/build/owe-1.v1.0.0.imscc");
});
