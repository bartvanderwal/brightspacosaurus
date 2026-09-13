/**
 * Property tests for offline diagram validation.
 *
 * Feature: diagram-rendering-a11y, Property 7
 * Validates: Requirements 12.2, 13.1, 13.2
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { detectDiagramIssues } from "../src/diagram-validation.ts";
import type { DiagramIssueKind } from "../src/diagram-validation.ts";

const sourceFile = "lesson.md";
const supportedLanguageArb = fc.constantFrom("plantuml", "mermaid", "kroki");
const unsupportedDiagramLanguageArb = fc.constantFrom(
  "graphviz",
  "dot",
  "d2",
  "nomnoml",
);
const titleArb = fc.stringMatching(/^[A-Za-z0-9 _-]{1,40}$/).filter((title) =>
  title.trim().length > 0
);
const bodyArb = fc
  .array(fc.stringMatching(/^[A-Za-z0-9 _.,:;+\-()[\]{}>"'=]{1,60}$/), {
    minLength: 1,
    maxLength: 5,
  })
  .map((lines) => lines.join("\n"));

function markdown(language: string, meta: string, body: string): string {
  return `# Diagram

\`\`\`${language}${meta ? ` ${meta}` : ""}
${body}
\`\`\`
`;
}

function hasIssue(markdownText: string, kind: DiagramIssueKind): boolean {
  return detectDiagramIssues(markdownText, sourceFile).some((issue) =>
    issue.kind === kind
  );
}

Deno.test("Property 7: valid supported diagram metadata has no validation issues", () => {
  fc.assert(
    fc.property(
      supportedLanguageArb,
      titleArb,
      bodyArb,
      (language, title, body) => {
        const issues = detectDiagramIssues(
          markdown(
            language,
            `imgType="${language}" imgTitle="${title}" src="images/${language}.puml"`,
            body,
          ),
          sourceFile,
        );
        assertEquals(issues, []);
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("Property 7: unknown fence options are reported with source context", () => {
  fc.assert(
    fc.property(supportedLanguageArb, bodyArb, (language, body) => {
      const issues = detectDiagramIssues(
        markdown(language, `imgType="${language}" surprise="yes"`, body),
        sourceFile,
      );
      const issue = issues.find((candidate) =>
        candidate.kind === "unknown-fence-option"
      );
      assertEquals(Boolean(issue), true);
      assertEquals(issue?.sourceFile, sourceFile);
      assertEquals(typeof issue?.position?.line, "number");
    }),
    { numRuns: 100 },
  );
});

Deno.test("Property 7: non-local src values are reported as invalid-src", () => {
  fc.assert(
    fc.property(
      supportedLanguageArb,
      fc.constantFrom(
        "https://example.test/diagram.puml",
        "/tmp/diagram.puml",
        "../diagram.puml",
      ),
      bodyArb,
      (language, src, body) => {
        assertEquals(
          hasIssue(
            markdown(language, `imgType="${language}" src="${src}"`, body),
            "invalid-src",
          ),
          true,
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("Property 7: empty supported diagram blocks are reported as empty-diagram", () => {
  fc.assert(
    fc.property(supportedLanguageArb, (language) => {
      assertEquals(
        hasIssue(
          markdown(language, `imgType="${language}"`, "   "),
          "empty-diagram",
        ),
        true,
      );
    }),
    { numRuns: 100 },
  );
});

Deno.test("Property 7: unsupported diagram declarations are reported", () => {
  fc.assert(
    fc.property(unsupportedDiagramLanguageArb, bodyArb, (language, body) => {
      assertEquals(
        hasIssue(markdown(language, "", body), "unsupported-language"),
        true,
      );
    }),
    { numRuns: 100 },
  );
});
