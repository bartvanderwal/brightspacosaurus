import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { cleanupBuildTestDirs } from "../utils/test-runner.ts";

Deno.test("test cleanup removes test directories but preserves other build data", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: "build",
    prefix: "cleanup-check-",
  });
  const testDir = join(root, "nav-test-output");
  const outputDir = join(root, "marp-tools");
  try {
    await Deno.mkdir(testDir);
    await Deno.mkdir(outputDir);
    await cleanupBuildTestDirs(root);
    await assertRejects(() => Deno.stat(testDir), Deno.errors.NotFound);
    assertEquals((await Deno.stat(outputDir)).isDirectory, true);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
