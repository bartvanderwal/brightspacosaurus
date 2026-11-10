import { assertEquals } from "@std/assert";
import { lintMarkdown } from "../src/course-linter.ts";

Deno.test(
  "Spec *Heading numbers in BSO's own documentation*, rules DN1-DN3: both shipped docs follow reader heading rules",
  async () => {
    for (const path of ["user-manual.md", "software-guidebook.md"]) {
      const markdown = await Deno.readTextFile(
        new URL(`../docs/${path}`, import.meta.url),
      );
      const headingIssues = lintMarkdown(markdown, `reader-${path}`).filter(
        (issue) =>
          issue.rule === "reader-heading-numbering" ||
          issue.rule === "numbered-sources",
      );
      assertEquals(headingIssues, [], path);
    }
  },
);
