/**
 * Property tests for diagram rendering pass-through and determinism.
 *
 * Feature: diagram-rendering-a11y, Property 5
 * Validates: Requirements 1.4, 1.6
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import fc from "fast-check";
import { join } from "@std/path";
import { convertMarkdown } from "../src/markdown-converter.ts";
import {
  classifyDiagramError,
  DiagramError,
  shouldFallbackDiagramError,
} from "../src/diagram-renderer.ts";
import type {
  DiagramErrorCategory,
  ResolvedDiagramConfig,
} from "../src/mod.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_diagram_pbt_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Ignore cleanup failures in tests.
  }
}

const unsupportedLanguageArb = fc
  .stringMatching(/^[a-z][a-z0-9_-]{0,12}$/)
  .filter((language) => !["plantuml", "mermaid", "kroki"].includes(language));

const codeArb = fc
  .array(fc.stringMatching(/^[A-Za-z0-9_ .,+\-/*()="';:]{0,50}$/), {
    minLength: 1,
    maxLength: 8,
  })
  .map((lines) => lines.join("\n"));

async function renderUnsupportedCode(
  tempRoot: string,
  fileName: string,
  language: string,
  code: string,
): Promise<string> {
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build");
  await Deno.mkdir(sourceDir, { recursive: true });
  const sourcePath = join(sourceDir, fileName);
  await Deno.writeTextFile(
    sourcePath,
    `# Unsupported code

\`\`\`${language}
${code}
\`\`\`
`,
  );

  const result = await convertMarkdown({
    sourcePath,
    outputDir,
    repoRoot: tempRoot,
    diagrams: {
      krokiUrl: "http://127.0.0.1:1",
      output: "img-html-base64",
      failOnError: true,
      locale: "nl",
    },
  });

  return await Deno.readTextFile(result.outputPath);
}

Deno.test("Property 5: unsupported code blocks pass through and double-run output is deterministic", async () => {
  await fc.assert(
    fc.asyncProperty(
      unsupportedLanguageArb,
      codeArb,
      async (language, code) => {
        const tempRoot = await makeTempDir();
        try {
          const first = await renderUnsupportedCode(
            tempRoot,
            "unsupported.md",
            language,
            code,
          );
          const second = await renderUnsupportedCode(
            tempRoot,
            "unsupported.md",
            language,
            code,
          );

          assertEquals(first, second);
          assertStringIncludes(first, `class="language-${language}"`);
          for (const line of code.split("\n")) {
            if (line.length > 0) {
              assertStringIncludes(first, line);
            }
          }
          assertEquals(first.includes("kroki-image"), false);
          assertEquals(first.includes("diagram-expandable-source"), false);
        } finally {
          await removeDir(tempRoot);
        }
      },
    ),
    { numRuns: 100 },
  );
});

const diagramErrorCategoryArb = fc.constantFrom<DiagramErrorCategory>(
  "kroki-unreachable",
  "invalid-source",
  "invalid-parameter",
);

function diagramConfig(failOnError: boolean): ResolvedDiagramConfig {
  return {
    krokiUrl: "https://kroki.io",
    output: "img-html-base64",
    failOnError,
    locale: "nl",
  };
}

Deno.test("Property 8: diagram error decision follows failOnError", () => {
  fc.assert(
    fc.property(
      diagramErrorCategoryArb,
      fc.boolean(),
      (category, failOnError) => {
        const error = new DiagramError(category, "lesson.md", "test reason");
        assertEquals(
          shouldFallbackDiagramError(error, diagramConfig(failOnError)),
          !failOnError,
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("Property 9: author errors are never classified as endpoint failures", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "invalid parameter: unknown option foo",
        "invalid src: ../outside.svg",
        "syntax error in PlantUML source",
        "parse error near line 3",
        "bad request: diagram source is invalid",
      ),
      (message) => {
        assertEquals(
          classifyDiagramError(new Error(message)) === "kroki-unreachable",
          false,
        );
      },
    ),
    { numRuns: 100 },
  );
});
