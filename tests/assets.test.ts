import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { dirname, join, resolve } from "@std/path";
import { disposeMaterializedAssets, materializeAsset } from "../src/assets.ts";

// Spec *Asset loading (JSR-safe)*, rules M1-M5.

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

Deno.test("M1: an asset is written under its own name in one folder per process", async () => {
  try {
    const filter = await materializeAsset("include-filter.lua");
    const header = await materializeAsset("reader-header.tex");
    assertEquals(filter.endsWith("include-filter.lua"), true);
    assertEquals(header.endsWith("reader-header.tex"), true);
    assertEquals(dirname(filter), dirname(header));
    assert(dirname(filter).includes("bso-assets-"));
    assert((await Deno.readTextFile(filter)).includes("include"));
  } finally {
    await disposeMaterializedAssets();
  }
});

Deno.test("M2: the same asset gives the same path, also for concurrent calls", async () => {
  try {
    const [a, b, c] = await Promise.all([
      materializeAsset("details-filter.lua"),
      materializeAsset("details-filter.lua"),
      materializeAsset("details-filter.lua"),
    ]);
    assertEquals(a, b);
    assertEquals(b, c);
    assertEquals(await materializeAsset("details-filter.lua"), a);
  } finally {
    await disposeMaterializedAssets();
  }
});

Deno.test("M3: dispose removes the folder, and a later call makes a new one", async () => {
  const first = await materializeAsset("chapter-filter.lua");
  await disposeMaterializedAssets();
  assertEquals(await exists(first), false);
  assertEquals(await exists(dirname(first)), false);
  try {
    const second = await materializeAsset("chapter-filter.lua");
    assertNotEquals(dirname(second), dirname(first));
    assertEquals(await exists(second), true);
  } finally {
    await disposeMaterializedAssets();
  }
  await disposeMaterializedAssets(); // nothing to do is not an error
});

Deno.test("M4: a name with a path separator or '..' is rejected", async () => {
  for (const name of ["../deno.json", "sub/file.lua", "..", "a\\b.lua", ""]) {
    await assertRejects(() => materializeAsset(name), Error, "asset name");
  }
});

// A child process with its own temp folder: whatever it leaves behind is visible here.
async function childLeavesBehind(code: string): Promise<string[]> {
  await Deno.mkdir("build", { recursive: true });
  const temp = await Deno.makeTempDir({ dir: "build", prefix: "assets-m3-" });
  try {
    const assets = resolve("src/assets.ts");
    await new Deno.Command("deno", {
      args: [
        "run",
        "--allow-all",
        "--no-check",
        "-e",
        `import { materializeAsset } from ${
          JSON.stringify("file://" + assets)
        };\n${code}`,
      ],
      env: { TMPDIR: resolve(temp) },
      stdout: "null",
      stderr: "null",
    }).output();
    const left: string[] = [];
    for await (const entry of Deno.readDir(temp)) left.push(entry.name);
    return left;
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
}

Deno.test("M3/M5: a process that ends normally leaves nothing in its temp folder", async () => {
  assertEquals(
    await childLeavesBehind(
      `await materializeAsset("include-filter.lua"); await materializeAsset("reader-header.tex");`,
    ),
    [],
  );
});

Deno.test("M3/M5: a process that throws leaves nothing in its temp folder", async () => {
  assertEquals(
    await childLeavesBehind(
      `await materializeAsset("include-filter.lua"); throw new Error("pandoc failed");`,
    ),
    [],
  );
});

Deno.test("M5: many conversions write each asset once", async () => {
  try {
    for (let reader = 0; reader < 25; reader++) {
      await materializeAsset("reader-header.tex");
      await materializeAsset("include-filter.lua");
    }
    const dir = dirname(await materializeAsset("include-filter.lua"));
    const names: string[] = [];
    for await (const entry of Deno.readDir(dir)) names.push(entry.name);
    assertEquals(names.sort(), ["include-filter.lua", "reader-header.tex"]);
    assertEquals(join(dir, "include-filter.lua").length > 0, true);
  } finally {
    await disposeMaterializedAssets();
  }
});
