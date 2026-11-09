import { assertEquals } from "@std/assert";
import { unified } from "unified";
import remarkParse from "remark-parse";
import {
  checkReaderHeadingNumbers,
  type ReaderHeading,
} from "../src/reader-headings.ts";

interface MarkdownNode {
  type: string;
  depth?: number;
  value?: string;
  children?: MarkdownNode[];
}

function nodeText(node: MarkdownNode): string {
  return node.value ?? (node.children ?? []).map(nodeText).join("");
}

function collectHeadings(
  node: MarkdownNode,
  headings: ReaderHeading[],
): void {
  if (node.type === "heading") {
    headings.push({ depth: node.depth ?? 0, text: nodeText(node) });
  }
  for (const child of node.children ?? []) collectHeadings(child, headings);
}

Deno.test(
  "Spec *Heading numbers in BSO's own documentation*, rules DN1-DN3: both shipped docs follow reader heading rules",
  async () => {
    assertEquals(
      checkReaderHeadingNumbers([
        { depth: 1, text: "Title" },
        { depth: 2, text: "1. References" },
      ]).length,
      1,
      "DN2 rejects numbered reference-list headings",
    );
    for (const path of ["user-manual.md", "software-guidebook.md"]) {
      const markdown = await Deno.readTextFile(
        new URL(`../docs/${path}`, import.meta.url),
      );
      const processor = unified().use(remarkParse);
      const tree = processor.parse(markdown) as unknown as MarkdownNode;
      const headings: ReaderHeading[] = [];
      collectHeadings(tree, headings);
      assertEquals(checkReaderHeadingNumbers(headings), [], path);
    }
  },
);
