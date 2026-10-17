import { assertEquals } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const root = join(dirname(fromFileUrl(import.meta.url)), "..");

Deno.test({
  name: "the published package contains no test files",
  permissions: { read: true },
  async fn() {
    const config = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
    const include: string[] = config.publish.include;
    const tests: string[] = [];
    for (const entry of include) {
      const path = join(root, entry);
      let stat: Deno.FileInfo;
      try {
        stat = await Deno.stat(path);
      } catch {
        continue;
      }
      if (!stat.isDirectory) {
        if (/(?:_test|\.test)\.[jt]s$/.test(entry)) tests.push(entry);
        continue;
      }
      const walk = async (dir: string): Promise<void> => {
        for await (const child of Deno.readDir(dir)) {
          const childPath = join(dir, child.name);
          if (child.isDirectory) await walk(childPath);
          else if (/(?:_test|\.test)\.[jt]s$/.test(child.name)) {
            tests.push(childPath);
          }
        }
      };
      await walk(path);
    }
    assertEquals(
      tests,
      [],
      "Move test files to tests/; publish.include must not ship them.",
    );
  },
});
