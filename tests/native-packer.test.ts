import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join, resolve } from "@std/path";
import JSZip from "jszip";
import {
  buildNativeManifest,
  escapeXml,
  moduleDescriptionFromHtml,
  nativePackageName,
  packNative,
} from "../src/native-packer.ts";

Deno.test("escapeXml escapes markup and keeps newlines as character references", () => {
  assertEquals(
    escapeXml('a & <b> "c"\r\nd'),
    "a &amp; &lt;b&gt; &quot;c&quot;&#10;d",
  );
});

Deno.test("moduleDescriptionFromHtml keeps the body without scripts and styles and roots relative paths", () => {
  const html =
    '<html><head><style>x{}</style></head><body><div><h1>Week</h1><img src="../images/pic.png" alt="p"><a href="other.html#a">o</a><a href="https://e.org/x.png">e</a></div><script>alert(1)</script></body></html>';
  const description = moduleDescriptionFromHtml(
    html,
    "content/week-1/index.html",
  );
  assertStringIncludes(description, 'src="content/images/pic.png"');
  assertStringIncludes(description, 'href="content/week-1/other.html#a"');
  assertStringIncludes(description, 'href="https://e.org/x.png"');
  assert(!description.includes("script"));
  assert(!description.includes("style"));
  assert(description.startsWith("<div><h1>Week</h1>"));
});

Deno.test("buildNativeManifest has module descriptions, backslash paths and is deterministic", () => {
  const input = {
    courseName: "Course & Co",
    language: "nl-nl",
    modules: [
      {
        title: "Week 1",
        descriptionHtml: '<h1>Hi</h1>\n<img src="content/images/a.png">',
        topics: [{ title: "Lesson <1>", href: "content/week-1/lesson.html" }],
      },
      { title: "Readers", descriptionHtml: "", topics: [] },
    ],
  };
  const manifest = buildNativeManifest(input);
  assertEquals(buildNativeManifest(input), manifest);
  assertStringIncludes(manifest, "Course &amp; Co");
  assertStringIncludes(
    manifest,
    'description="&lt;h1&gt;Hi&lt;/h1&gt;&#10;&lt;img src=&quot;content/images/a.png&quot;&gt;"',
  );
  assertStringIncludes(manifest, 'd2l_2p0:material_type="contentmodule"');
  assertStringIncludes(manifest, 'href="content\\week-1\\lesson.html"');
  assertStringIncludes(manifest, "<title>Lesson &lt;1&gt;</title>");
  assertEquals(manifest.match(/d2l_2p0:id="\d+"/g)?.length, 3);
  // Every tag that opens is closed again: a cheap well-formedness check.
  const tags = manifest.match(/<\/?[A-Za-z][^>]*>/g) ?? [];
  const stack: string[] = [];
  for (const tag of tags) {
    const name = tag.match(/<\/?([^\s/>]+)/)![1];
    if (tag.endsWith("/>")) continue;
    if (tag.startsWith("</")) assertEquals(stack.pop(), name);
    else stack.push(name);
  }
  assertEquals(stack, []);
});

Deno.test("packNative makes the lead page the module description, leaves out quizzes and packs the course files", async () => {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({
    dir: resolve("build"),
    prefix: "native-",
  });
  try {
    const write = async (path: string, text: string) => {
      await Deno.mkdir(join(root, path, ".."), { recursive: true });
      await Deno.writeTextFile(join(root, path), text);
    };
    await write(
      "content/week-1/index.html",
      '<html><body><h1>Week 1</h1><img src="../images/p.png"></body></html>',
    );
    await write("content/week-1/lesson.html", "<html><body>L</body></html>");
    await write("content/images/p.png", "png");
    await write("quiz/week-1/qti.xml", "<q/>");
    await write("readers/reader-a.pdf", "pdf");
    await write(
      "navigation.json",
      JSON.stringify({
        version: 1,
        modules: [{
          id: "week-1",
          title: "Week 1",
          indexId: "lessons/week-1/index",
          items: [
            {
              kind: "lesson",
              docId: "lessons/week-1/index",
              href: "content/week-1/index.html",
              title: "Week 1",
              code: null,
              position: null,
            },
            {
              kind: "lesson",
              docId: "lessons/week-1/lesson",
              href: "content/week-1/lesson.html",
              title: "Lesson",
              code: null,
              position: null,
            },
            {
              kind: "quiz",
              docId: "lessons/week-1/quiz",
              href: "quiz/week-1/qti.xml",
              title: "Quiz",
              code: null,
              position: null,
            },
          ],
        }, {
          id: "readers",
          title: "Readers",
          indexId: null,
          items: [{
            kind: "reader",
            docId: null,
            href: "readers/reader-a.pdf",
            title: "Reader A",
            code: null,
            position: null,
          }],
        }],
      }),
    );
    const outputPath = join(root, nativePackageName("demo", "1.0.0"));
    const result = await packNative({
      buildDir: root,
      outputPath,
      courseName: "Demo",
    });
    assertEquals(result, {
      modules: 2,
      topics: 2,
      files: 4,
      skippedQuizzes: 1,
    });
    const zip = await JSZip.loadAsync(await Deno.readFile(outputPath));
    const names = Object.keys(zip.files).sort();
    assertEquals(names, [
      "content/images/p.png",
      "content/week-1/index.html",
      "content/week-1/lesson.html",
      "courseimage_d2l.xml",
      "imsmanifest.xml",
      "readers/reader-a.pdf",
    ]);
    const manifest = await zip.file("imsmanifest.xml")!.async("string");
    assertStringIncludes(manifest, "src=&quot;content/images/p.png&quot;");
    assertStringIncludes(manifest, 'href="content\\week-1\\lesson.html"');
    assert(!manifest.includes("qti.xml"));
    assertEquals(outputPath.endsWith("demo.v1.0.0.d2l.zip"), true);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
