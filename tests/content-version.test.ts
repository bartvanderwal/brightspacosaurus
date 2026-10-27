import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import { computeContentHash, withContentHash } from "../src/content-version.ts";
import { staleVersions } from "../src/publisher.ts";

// Spec *Content version*, rules CV1-CV7.

async function fixture(
  run: (root: string, hash: (bso?: string) => Promise<string>) => Promise<void>,
) {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: "build",
    prefix: "content-version-",
  });
  try {
    const write = async (path: string, text: string) => {
      await Deno.mkdir(join(root, path, ".."), { recursive: true });
      await Deno.writeTextFile(join(root, path), text);
    };
    await write("out/content/week/lesson.html", "<h1>Lesson</h1>");
    await write("out/quiz/week/quiz.xml", "<quiz/>");
    await write("readers/reader.md", "# Reader");
    await run(root, (bso = "1.0.0") =>
      computeContentHash({
        buildDir: join(root, "out"),
        sourceDirs: [join(root, "readers")],
        bsoVersion: bso,
      }));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("CV1: the version is the course version and seven hexadecimal digits as build metadata", async () => {
  await fixture(async (_root, hash) => {
    const value = await hash();
    assertMatch(value, /^[0-9a-f]{7}$/);
    assertEquals(withContentHash("0.11.0", value), `0.11.0+${value}`);
  });
});

Deno.test("CV3: the same content gives the same hash, and any change in content or name gives another", async () => {
  await fixture(async (root, hash) => {
    const first = await hash();
    assertEquals(await hash(), first);
    await Deno.writeTextFile(
      join(root, "out/content/week/lesson.html"),
      "<h1>Lesson!</h1>",
    );
    const changed = await hash();
    assertNotEquals(changed, first);
    await Deno.rename(
      join(root, "out/content/week/lesson.html"),
      join(root, "out/content/week/other.html"),
    );
    assertNotEquals(await hash(), changed);
    await Deno.writeTextFile(join(root, "out/content/week/extra.html"), "x");
    assertNotEquals(await hash(), changed);
  });
});

Deno.test("CV3: the order in which the files were written does not matter", async () => {
  let one = "";
  await fixture(async (root, hash) => {
    await Deno.writeTextFile(join(root, "out/content/a.html"), "a");
    await Deno.writeTextFile(join(root, "out/content/b.html"), "b");
    one = await hash();
  });
  await fixture(async (root, hash) => {
    await Deno.writeTextFile(join(root, "out/content/b.html"), "b");
    await Deno.writeTextFile(join(root, "out/content/a.html"), "a");
    assertEquals(await hash(), one);
  });
});

Deno.test("CV2: the quizzes and the reader sources count, and so does the version of BSO", async () => {
  await fixture(async (root, hash) => {
    const first = await hash();
    await Deno.writeTextFile(
      join(root, "out/quiz/week/quiz.xml"),
      "<quiz>2</quiz>",
    );
    const quiz = await hash();
    assertNotEquals(quiz, first);
    await Deno.writeTextFile(join(root, "readers/reader.md"), "# Reader 2");
    const reader = await hash();
    assertNotEquals(reader, quiz);
    assertNotEquals(await hash("1.0.1"), reader);
  });
});

Deno.test("CV4: the manifest, the teacher pages and the PDF that a reader makes do not count", async () => {
  await fixture(async (root, hash) => {
    const first = await hash();
    await Deno.writeTextFile(join(root, "out/imsmanifest.xml"), "<manifest/>");
    await Deno.writeTextFile(join(root, "out/navigation.json"), "{}");
    await Deno.mkdir(join(root, "out/docenten"), { recursive: true });
    await Deno.writeTextFile(
      join(root, "out/docenten/for-teachers.pdf"),
      "time 1",
    );
    await Deno.mkdir(join(root, "out/readers"), { recursive: true });
    await Deno.writeTextFile(join(root, "out/readers/reader.pdf"), "date 1");
    assertEquals(await hash(), first);
    await Deno.writeTextFile(join(root, "out/readers/reader.pdf"), "date 2");
    assertEquals(await hash(), first);
  });
});

Deno.test("CV5/CV7: a package with a hash in its name is a version of the same package for the folder of publications", () => {
  const files = [
    "demo.v1.0.0+aaaaaaa.imscc",
    "demo.v1.0.0+bbbbbbb.imscc",
    "demo.v1.0.0+bbbbbbb.d2l.zip",
    "notes.txt",
  ];
  assertEquals(
    staleVersions(files, "demo", "demo.v1.0.0+bbbbbbb.imscc"),
    ["demo.v1.0.0+aaaaaaa.imscc"],
  );
});
