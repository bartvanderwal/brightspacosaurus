import { assertEquals } from "@std/assert";
import { lintMarkdown } from "../src/course-linter.ts";

Deno.test(
  "Spec *Heading numbers in BSO's own documentation*, rules DN1-DN3: both shipped docs follow reader heading rules",
  async () => {
    for (const path of ["user-manual.md", "software-guidebook.md"]) {
      const source = new URL(`../docs/${path}`, import.meta.url);
      assertEquals(
        lintMarkdown("# Document\n\n## Unnumbered\n", source.pathname).some(
          (issue) => issue.rule === "reader-heading-numbering",
        ),
        true,
        `${path} must use reader heading-number rules`,
      );
      const markdown = await Deno.readTextFile(source);
      const headingIssues = lintMarkdown(markdown, source.pathname).filter(
        (issue) =>
          issue.rule === "reader-heading-numbering" ||
          issue.rule === "numbered-sources",
      );
      assertEquals(headingIssues, [], path);
    }
  },
);
