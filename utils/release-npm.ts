/**
 * Publishes the current version to npm in one command (`deno task release:npm`),
 * so the release steps cannot get out of order (#77).
 *
 * Steps:
 * 1. Check the npm login. npm answers a publish without a valid login with a
 *    misleading `404 Not Found`, so fail early with a clear message instead.
 * 2. `deno pack` into `build/npm-release/` (never next to the sources).
 * 3. Extract the tarball and fix two `deno pack` quirks (see fixPackage).
 * 4. `npm publish --access public` from the extracted folder. Publishing from the
 *    folder instead of the tarball keeps the README (npm/cli#3548).
 * 5. Remove `build/npm-release/`.
 *
 * `--dry-run` runs everything, but calls `npm publish --dry-run` and keeps the
 * folder for inspection.
 *
 * @module
 */
import { join } from "@std/path";

/** Packaging options, the same as documented in AGENTS.md. */
export const PACK_IGNORES = [
  "tests/",
  "**/*_test.ts",
  "**/*.test.ts",
  "src/marp-exporter.ts",
];

/** A `package.json` export entry as written by `deno pack`. */
type ExportEntry = string | Record<string, string>;

/**
 * Fixes the output of `deno pack` for the hand-written declaration of the tabs
 * script, and returns the relative paths of files to delete.
 *
 * - `deno pack` treats `assets/*.d.ts` as a module and emits an empty
 *   `*.d.ts.d.ts` next to it. That file is deleted.
 * - A JavaScript export whose `.js` names its types with `@ts-self-types` gets
 *   no `types` condition in `package.json`, so TypeScript users get no types.
 *   The `types` condition is added when the declaration file is in the package.
 *
 * Pure function: it only looks at the given file list, for easy testing.
 */
export function fixPackage(
  packageJson: { exports?: Record<string, ExportEntry> },
  files: string[],
): { packageJson: typeof packageJson; remove: string[] } {
  const remove = files.filter((file) => file.endsWith(".d.ts.d.ts")).sort();
  const exports: Record<string, ExportEntry> = {};
  for (const [key, entry] of Object.entries(packageJson.exports ?? {})) {
    if (typeof entry !== "string" && !entry.types && entry.import) {
      const declaration = entry.import.replace(/\.js$/, ".d.ts");
      if (
        declaration !== entry.import &&
        files.includes(declaration.replace(/^\.\//, ""))
      ) {
        exports[key] = { types: declaration, ...entry };
        continue;
      }
    }
    exports[key] = entry;
  }
  return {
    packageJson: packageJson.exports
      ? { ...packageJson, exports }
      : packageJson,
    remove,
  };
}

async function run(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const output = await new Deno.Command(command, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  return {
    code: output.code,
    stdout: decode(output.stdout),
    stderr: decode(output.stderr),
  };
}

async function listFiles(root: string, dir = ""): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(join(root, dir))) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory) files.push(...await listFiles(root, path));
    else files.push(path);
  }
  return files;
}

async function main(dryRun: boolean): Promise<void> {
  const whoami = await run("npm", ["whoami"]);
  if (whoami.code !== 0) {
    console.error(
      "Not logged in to npm (npm whoami failed). Run `npm login` first; " +
        "a publish without login fails with a misleading 404.",
    );
    Deno.exit(1);
  }
  console.log(`npm user: ${whoami.stdout.trim()}`);

  const version = JSON.parse(await Deno.readTextFile("deno.json")).version;
  const releaseDir = join("build", "npm-release");
  await Deno.remove(releaseDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(releaseDir, { recursive: true });
  const tarball = join(releaseDir, `brightspacosaurus-${version}.tgz`);

  // A real release must come from a clean commit; a dry run may be dirty.
  const pack = await run("deno", [
    "pack",
    ...(dryRun ? ["--allow-dirty"] : []),
    ...PACK_IGNORES.map((pattern) => `--ignore=${pattern}`),
    "--output",
    tarball,
  ]);
  if (pack.code !== 0) {
    console.error(pack.stderr || pack.stdout);
    Deno.exit(1);
  }
  const untar = await run("tar", ["-xzf", tarball, "-C", releaseDir]);
  if (untar.code !== 0) {
    console.error(untar.stderr);
    Deno.exit(1);
  }

  const packageDir = join(releaseDir, "package");
  const packageJsonPath = join(packageDir, "package.json");
  const { packageJson, remove } = fixPackage(
    JSON.parse(await Deno.readTextFile(packageJsonPath)),
    await listFiles(packageDir),
  );
  await Deno.writeTextFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  for (const file of remove) {
    await Deno.remove(join(packageDir, file));
    console.log(`Removed ${file}`);
  }

  const publish = await run(
    "npm",
    ["publish", "--access", "public", ...(dryRun ? ["--dry-run"] : [])],
    packageDir,
  );
  console.log(publish.stdout);
  if (publish.code !== 0) {
    console.error(publish.stderr);
    Deno.exit(1);
  }
  if (dryRun) {
    console.log(`Dry run: inspect ${packageDir}`);
  } else {
    await Deno.remove(releaseDir, { recursive: true });
    console.log(
      `Published @bartvanderwal/brightspacosaurus@${version} to npm.`,
    );
  }
}

if (import.meta.main) {
  await main(Deno.args.includes("--dry-run"));
}
