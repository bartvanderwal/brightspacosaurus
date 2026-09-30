import fc from "fast-check";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { resolve } from "@std/path";
import { loadAssetText } from "../src/assets.ts";
import { convertMarkdown } from "../src/markdown-converter.ts";

interface TocTopic {
  TopicId: number;
  Url?: string;
}
interface TocModule {
  Topics?: TocTopic[];
  Modules?: TocModule[];
}
interface Navigation {
  orgUnitFrom(topPath: string, framePath: string): string | null;
  topicPath(url: string): string;
  findTopicId(toc: { Modules?: TocModule[] }, path: string): number | null;
  viewUrl(topPath: string, orgUnitId: string, topicId: number): string;
  isLessonLinkClick(
    event: Record<string, unknown>,
    link: Record<string, unknown>,
    location: { origin: string; pathname: string },
  ): boolean;
}

/** Evaluates the browser asset without a DOM; it only exposes its helpers. */
async function loadNavigation(): Promise<Navigation> {
  const sandbox: { bsoTopicNavigation?: Navigation } = {};
  new Function(
    "globalThis",
    await loadAssetText("brightspacosaurus-navigation.js"),
  )(
    sandbox,
  );
  return sandbox.bsoTopicNavigation!;
}

const nav = await loadNavigation();

Deno.test("org unit comes from the viewer URL, else from the topic file URL", () => {
  assertEquals(
    nav.orgUnitFrom("/d2l/le/content/12345/viewContent/678/View", ""),
    "12345",
  );
  assertEquals(nav.orgUnitFrom("/d2l/le/lessons/42/topics/7", ""), "42");
  assertEquals(
    nav.orgUnitFrom("/d2l/home/9", "/content/enforced/777-FUSTEN/a.html"),
    "777",
  );
  assertEquals(nav.orgUnitFrom("/lessons/week-1/", "/week-1/a.html"), null);
});

Deno.test("topic paths ignore origin, query, hash, case and encoding", () => {
  assertEquals(
    nav.topicPath(
      "https://han.brightspace.com/content/enforced/1-X/Week%201/Les.HTML?ou=1#top",
    ),
    "/content/enforced/1-x/week 1/les.html",
  );
  assertEquals(nav.topicPath("/a//b.html"), "/a/b.html");
  assertEquals(nav.topicPath("/bad%zz.html"), "/bad%zz.html");
});

Deno.test("findTopicId searches nested modules in menu order", () => {
  const toc = {
    Modules: [
      {
        Topics: [{ TopicId: 1, Url: "/content/enforced/1-X/README.html" }],
        Modules: [{
          Topics: [
            { TopicId: 2 },
            { TopicId: 3, Url: "/content/enforced/1-X/week-1/les.html" },
          ],
        }],
      },
      {
        Topics: [{ TopicId: 4, Url: "/content/enforced/1-X/week-1/les.html" }],
      },
    ],
  };
  assertEquals(
    nav.findTopicId(toc, "/content/enforced/1-X/week-1/les.html"),
    3,
  );
  assertEquals(nav.findTopicId(toc, "/content/enforced/1-X/other.html"), null);
  assertEquals(nav.findTopicId({}, "/x.html"), null);
});

Deno.test("findTopicId finds any topic among arbitrary others (property)", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.stringMatching(/^[a-z0-9-]{1,12}$/), {
        minLength: 1,
        maxLength: 15,
      }),
      fc.nat(),
      (names, pick) => {
        const topics = names.map((name, i) => ({
          TopicId: i + 1,
          Url: `/content/enforced/9-C/${name}.html`,
        }));
        const index = pick % names.length;
        const toc = { Modules: [{ Modules: [{ Topics: topics }] }] };
        assertEquals(
          nav.findTopicId(toc, `/content/enforced/9-C/${names[index]}.html`),
          index + 1,
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("viewUrl follows the classic content or the Lessons experience", () => {
  assertEquals(
    nav.viewUrl("/d2l/le/content/5/viewContent/1/View", "5", 9),
    "/d2l/le/content/5/viewContent/9/View",
  );
  assertEquals(
    nav.viewUrl("/d2l/le/lessons/5/topics/1", "5", 9),
    "/d2l/le/lessons/5/topics/9",
  );
});

Deno.test("only plain clicks on same-origin links to other HTML pages are handled", () => {
  const location = { origin: "https://lms", pathname: "/c/a.html" };
  const click = { defaultPrevented: false, button: 0 };
  const link = (
    attrs: Record<string, string>,
    props: Record<string, string>,
  ) => ({
    getAttribute: (name: string) => attrs[name] ?? null,
    hasAttribute: (name: string) => name in attrs,
    origin: "https://lms",
    pathname: "/c/b.html",
    ...props,
  });
  assertEquals(nav.isLessonLinkClick(click, link({}, {}), location), true);
  assertEquals(
    nav.isLessonLinkClick(click, link({ target: "_self" }, {}), location),
    true,
  );
  for (
    const [event, candidate] of [
      [{ ...click, ctrlKey: true }, link({}, {})],
      [{ ...click, metaKey: true }, link({}, {})],
      [{ ...click, button: 1 }, link({}, {})],
      [{ ...click, defaultPrevented: true }, link({}, {})],
      [click, link({ target: "_blank" }, {})],
      [click, link({ download: "" }, {})],
      [click, link({}, { origin: "https://youtube.com" })],
      [click, link({}, { pathname: "/c/reader.pdf" })],
      [click, link({}, { pathname: "/c/a.html" })],
    ] as const
  ) {
    assertEquals(nav.isLessonLinkClick(event, candidate, location), false);
  }
});

Deno.test("exported lesson pages include the navigation script once", async () => {
  await Deno.mkdir("build", { recursive: true });
  const outputDir = await Deno.makeTempDir({ dir: "build", prefix: "nav-" });
  try {
    const result = await convertMarkdown({
      sourcePath: resolve("examples/demo-course/lessons/README.md"),
      outputDir,
      repoRoot: Deno.cwd(),
    });
    const html = await Deno.readTextFile(result.outputPath);
    assertEquals(html.split("root.bsoTopicNavigation =").length - 1, 1);
    assertStringIncludes(html, 'href="week-1/lesson-1-fizzbuzz.html"');
  } finally {
    await Deno.remove(outputDir, { recursive: true });
  }
});
