import { assertEquals } from "@std/assert";
import { remarkPreviewSlides } from "../src/slides-preview-remark.ts";

type Node = { attributes?: { name: string; value: string | null }[] };

function mark(lessons: Record<string, string>, path: string): Node[] {
  const tree = { children: [] as unknown[] };
  remarkPreviewSlides({ lessons })(tree, { path });
  return tree.children as Node[];
}

const attributes = (node: Node) =>
  Object.fromEntries(node.attributes!.map((a) => [a.name, a.value]));

// Spec *The lesson as slides: Alt+T*, rule T2.
Deno.test("T2: a lesson presentation carries its deck in data-bso-slides-lesson and its extra slides in data-bso-slides", () => {
  const [node] = mark({
    "/c/l.md": "slides/l/index.html",
    "lesson:/c/l.md": "slides/l/index.html",
    "extra:/c/l.md": "slides/decks/extra/index.html",
  }, "/c/l.md");
  assertEquals(attributes(node), {
    hidden: null,
    "data-bso-slides": "/slides/decks/extra/index.html",
    "data-bso-slides-lesson": "/slides/l/index.html",
  });
});

Deno.test("T2: a lesson presentation without extra slides has no data-bso-slides, so no button and no Alt+P", () => {
  const [node] = mark({
    "/c/l.md": "slides/l/index.html",
    "lesson:/c/l.md": "slides/l/index.html",
  }, "/c/l.md");
  assertEquals(attributes(node), {
    hidden: null,
    "data-bso-slides-lesson": "/slides/l/index.html",
  });
});

Deno.test("T2: a lesson with only configured decks carries data-bso-slides, a lesson without slides nothing", () => {
  const lessons = { "/c/l.md": "slides/l/index.html" };
  assertEquals(attributes(mark(lessons, "/c/l.md")[0]), {
    hidden: null,
    "data-bso-slides": "/slides/l/index.html",
  });
  assertEquals(mark(lessons, "/c/other.md").length, 0);
  // The entries of another lesson do not mark this one.
  assertEquals(
    attributes(mark({ ...lessons, "lesson:/c/m.md": "y" }, "/c/l.md")[0]),
    { hidden: null, "data-bso-slides": "/slides/l/index.html" },
  );
});

// Spec *The lesson as slides: Alt+T*, rule T9.
Deno.test("T9: the line of links is a paragraph after the first heading, with the base of the site in front of each link", () => {
  const tree = {
    children: [
      { type: "heading", depth: 1 },
      { type: "paragraph" },
    ] as unknown[],
  };
  remarkPreviewSlides({
    lessons: {
      "/c/l.md": "slides/l/index.html",
      "links:/c/l.md": JSON.stringify([
        {
          href: "slides/l/index.html",
          text: "Present this lesson",
          download: false,
        },
        {
          href: "slides/l/l.pptx",
          text: "Download PowerPoint (l.pptx)",
          download: true,
        },
      ]),
    },
    baseUrl: "/docs",
  })(tree, { path: "/c/l.md" });
  const line = tree.children[1] as {
    type: string;
    children: {
      name?: string;
      value?: string;
      attributes?: { name: string; value: string | null }[];
    }[];
  };
  assertEquals(line.type, "paragraph");
  assertEquals(line.children.map((child) => child.name ?? child.value), [
    "a",
    " · ",
    "a",
  ]);
  assertEquals(
    line.children[0].attributes![0].value,
    "/docs/slides/l/index.html",
  );
  assertEquals(
    line.children[2].attributes!.some((a) => a.name === "download"),
    true,
  );
  assertEquals(tree.children.length, 4);
});
