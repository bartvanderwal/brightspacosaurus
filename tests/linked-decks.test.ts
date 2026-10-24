import { assertEquals } from "@std/assert";
import {
  deckBody,
  deckTitle,
  deckTopicName,
  findDeckLinks,
  findMarkdownLinks,
  rewriteLinkTargets,
} from "../src/linked-decks.ts";

Deno.test("findMarkdownLinks finds inline links to .md files, not images, code, anchors-only or URLs", () => {
  const markdown = [
    "# Lesson",
    "",
    'See [the deck](../slides/deck.md) and [other](other.md#part "title").',
    "![image](pic.md)",
    "An external [link](https://example.org/readme.md).",
    "Inline `[code](hidden.md)` stays.",
    "",
    "```md",
    "[fenced](fenced.md)",
    "```",
    "",
    "[angle](<spaced.md>)",
  ].join("\n");
  const links = findMarkdownLinks(markdown);
  assertEquals(links.map((link) => [link.href, link.text, link.line]), [
    ["../slides/deck.md", "the deck", 3],
    ["other.md", "other", 3],
    ["spaced.md", "angle", 12],
  ]);
});

Deno.test("deckTitle prefers the front matter title, then the first heading, then the fallback", () => {
  assertEquals(
    deckTitle("---\nslides: true\ntitle: FizzBuzz\n---\n# Heading", "x"),
    "FizzBuzz",
  );
  assertEquals(
    deckTitle('---\nslides: true\ntitle: "Quoted"\n---\n', "x"),
    "Quoted",
  );
  assertEquals(
    deckTitle("---\nslides: true\n---\n\n# First heading\n", "x"),
    "First heading",
  );
  assertEquals(
    deckTitle("---\nslides: true\n---\ntext", "fallback"),
    "fallback",
  );
  assertEquals(deckBody("---\nslides: true\n---\n# A\n"), "# A\n");
});

Deno.test("findDeckLinks keeps only links to existing files that are slide decks, in order", () => {
  const files: Record<string, string> = {
    "/s/a.md": "---\nslides: true\ntitle: Deck A\n---\n# A\n\ntext\n",
    "/s/b.md": "# Not a deck\n",
    "/s/c.md": "---\nmarp: true\n---\n# C\n",
  };
  const markdown =
    "[a](a.md)\n[b](b.md)\n[missing](missing.md)\n[c](c.md)\n[a again](a.md)\n";
  const decks = findDeckLinks(
    markdown,
    (href) => `/s/${href}`,
    (path) => files[path] ?? null,
    (path) => path.split("/").pop()!.replace(/\.md$/, ""),
  );
  assertEquals(decks.map((deck) => [deck.path, deck.title, deck.line]), [
    ["/s/a.md", "Deck A", 1],
    ["/s/c.md", "C", 4],
    ["/s/a.md", "Deck A", 5],
  ]);
  assertEquals(decks[0].body, "# A\n\ntext");
});

Deno.test("deckTopicName drops a leading slides- so the name does not repeat itself", () => {
  assertEquals(
    deckTopicName("lesson-1-fizzbuzz", "slides-fizzbuzz"),
    "lesson-1-fizzbuzz-slides-fizzbuzz",
  );
  assertEquals(deckTopicName("lesson", "depth"), "lesson-slides-depth");
});

Deno.test("rewriteLinkTargets changes only the chosen targets outside code and keeps anchors", () => {
  const markdown =
    "[a](deck.md#x) and [b](page.md) and `[c](deck.md)` and [d](<deck.md>)\n\n```\n[e](deck.md)\n```\n";
  const result = rewriteLinkTargets(
    markdown,
    (href) => href === "deck.md" ? "lesson-slides-deck.html" : undefined,
  );
  assertEquals(
    result,
    "[a](lesson-slides-deck.html#x) and [b](page.md) and `[c](deck.md)` and [d](<lesson-slides-deck.html>)\n\n```\n[e](deck.md)\n```\n",
  );
});
