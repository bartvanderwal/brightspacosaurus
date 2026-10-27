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
