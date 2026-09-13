/**
 * Integration tests for in-process `remark-kroki-a11y` rendering.
 *
 * Feature: diagram-rendering-a11y
 * Validates: Requirements 1.1, 1.2, 1.4, 9.3, 9.5
 */

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { basename, join } from "@std/path";
import { convertMarkdown } from "../src/markdown-converter.ts";
import { DiagramError } from "../src/diagram-renderer.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_diagram_test_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Ignore cleanup failures in tests.
  }
}

function startMockKroki() {
  const requests: string[] = [];
  const controller = new AbortController();
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: controller.signal,
    onListen: () => undefined,
  }, (request) => {
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}`);
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Mock diagram</title></svg>',
      { headers: { "content-type": "image/svg+xml" } },
    );
  });

  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    requests,
    async close() {
      controller.abort();
      await server.finished.catch(() => undefined);
    },
  };
}

async function convertFixture(
  tempRoot: string,
  fixtureName: string,
  mockKrokiUrl: string,
  output: "img-html-base64" | "inline-svg" = "img-html-base64",
): Promise<string> {
  const sourceDir = join(tempRoot, "src");
  const outputDir = join(tempRoot, "build", basename(fixtureName, ".md"));
  await Deno.mkdir(sourceDir, { recursive: true });
  const sourcePath = join(sourceDir, fixtureName);
  const fixture = await Deno.readTextFile(
    join("tests", "fixtures", fixtureName),
  );
  await Deno.writeTextFile(sourcePath, fixture);

  const result = await convertMarkdown({
    sourcePath,
    outputDir,
    repoRoot: tempRoot,
    diagrams: {
      krokiUrl: mockKrokiUrl,
      output,
      failOnError: true,
      locale: "nl",
    },
  });

  return await Deno.readTextFile(result.outputPath);
}

Deno.test("convertMarkdown renders PlantUML fixture through remark-kroki-a11y and preserves non-diagram code", async () => {
  const tempRoot = await makeTempDir();
  const mockKroki = startMockKroki();
  try {
    const html = await convertFixture(
      tempRoot,
      "diagram-plantuml.md",
      mockKroki.url,
    );

    assertEquals(mockKroki.requests, ["POST /plantuml/svg"]);
    assertStringIncludes(html, 'class="kroki-image"');
    assertStringIncludes(html, 'src="data:image/svg+xml;base64,');
    assertStringIncludes(html, 'alt="PlantUML diagram fixture"');
    assertStringIncludes(html, 'aria-describedby="bso-diagram-1-description"');
    assertStringIncludes(html, "<details");
    assertStringIncludes(html, "PlantUML broncode");
    assertStringIncludes(html, 'class="diagram-a11y-description"');
    assertStringIncludes(html, "<summary>In natuurlijke taal</summary>");
    assertStringIncludes(html, 'class="language-ts"');
    assertStringIncludes(html, "console.log");
    assertEquals(html.includes("<script"), false);
    assertEquals(html.includes('role="tablist"'), false);
    assertEquals(html.includes("<button"), false);
  } finally {
    await mockKroki.close();
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown renders Mermaid fixture through remark-kroki-a11y", async () => {
  const tempRoot = await makeTempDir();
  const mockKroki = startMockKroki();
  try {
    const html = await convertFixture(
      tempRoot,
      "diagram-mermaid.md",
      mockKroki.url,
    );

    assertEquals(mockKroki.requests, ["POST /mermaid/svg"]);
    assertStringIncludes(html, 'class="kroki-image"');
    assertStringIncludes(html, 'src="data:image/svg+xml;base64,');
    assertStringIncludes(html, 'alt="Mermaid diagram fixture"');
    assertStringIncludes(html, 'aria-describedby="bso-diagram-1-description"');
    assertStringIncludes(html, "Mermaid broncode");
    assertStringIncludes(html, 'class="diagram-a11y-description"');
    assertEquals(html.includes("<script"), false);
    assertEquals(html.includes('role="tablist"'), false);
    assertEquals(html.includes("<button"), false);
  } finally {
    await mockKroki.close();
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown wires inline SVG with role, title and description", async () => {
  const tempRoot = await makeTempDir();
  const mockKroki = startMockKroki();
  try {
    const html = await convertFixture(
      tempRoot,
      "diagram-plantuml.md",
      mockKroki.url,
      "inline-svg",
    );

    assertEquals(mockKroki.requests, ["POST /plantuml/svg"]);
    assertStringIncludes(html, 'class="kroki-inline-svg"');
    assertStringIncludes(html, '<svg xmlns="http://www.w3.org/2000/svg"');
    assertStringIncludes(html, 'role="img"');
    assertStringIncludes(html, 'aria-labelledby="bso-diagram-1-title"');
    assertStringIncludes(html, 'aria-describedby="bso-diagram-1-description"');
    assertStringIncludes(
      html,
      '<title id="bso-diagram-1-title">PlantUML diagram fixture</title>',
    );
  } finally {
    await mockKroki.close();
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown warns and keeps source disclosure when a diagram description is missing", async () => {
  const tempRoot = await makeTempDir();
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  try {
    const sourceDir = join(tempRoot, "src");
    const outputDir = join(tempRoot, "build", "missing-description");
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "missing-description.md");
    await Deno.writeTextFile(
      sourcePath,
      `# Diagram zonder beschrijving

<p><img class="kroki-image" src="data:image/svg+xml;base64,PHN2Zy8+" alt="Diagram zonder beschrijving"></p>
<details class="diagram-expandable-source" lang="nl">
<summary>PlantUML broncode</summary>
<div class="diagram-expandable-source-tabs">
<div role="tablist"><button data-tab="source">Broncode</button></div>
<section data-tab="source"><pre><code>@startuml
Alice -> Bob
@enduml</code></pre></section>
</div>
</details>
`,
    );

    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
    });
    const html = await Deno.readTextFile(result.outputPath);

    assertEquals(
      warnings.some((warning) =>
        warning.includes(
          "diagram-a11y: Diagram 1 has no natural-language description",
        )
      ),
      true,
    );
    assertStringIncludes(html, 'class="kroki-image"');
    assertStringIncludes(html, 'alt="Diagram zonder beschrijving"');
    assertStringIncludes(html, "<details");
    assertStringIncludes(html, "PlantUML broncode");
    assertStringIncludes(html, "Alice -> Bob");
    assertEquals(
      html.includes('aria-describedby="bso-diagram-1-description"'),
      false,
    );
    assertEquals(html.includes('role="tablist"'), false);
    assertEquals(html.includes("<button"), false);
  } finally {
    console.warn = originalWarn;
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown throws a typed DiagramError for an unreachable Kroki endpoint in strict mode", async () => {
  const tempRoot = await makeTempDir();
  try {
    const sourceDir = join(tempRoot, "src");
    const outputDir = join(tempRoot, "build", "strict-unreachable");
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "strict-unreachable.md");
    await Deno.writeTextFile(
      sourcePath,
      `# Strict unreachable

\`\`\`plantuml
@startuml
Alice -> Bob
@enduml
\`\`\`
`,
    );

    const error = await assertRejects(
      () =>
        convertMarkdown({
          sourcePath,
          outputDir,
          repoRoot: tempRoot,
          diagrams: {
            krokiUrl: "http://127.0.0.1:1",
            output: "img-html-base64",
            failOnError: true,
            locale: "nl",
          },
        }),
      DiagramError,
      "strict-unreachable.md",
    );
    assertEquals(error.category, "kroki-unreachable");
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown falls back to the original fenced code block when Kroki is unreachable and failOnError is false", async () => {
  const tempRoot = await makeTempDir();
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  try {
    const sourceDir = join(tempRoot, "src");
    const outputDir = join(tempRoot, "build", "fallback-unreachable");
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "fallback-unreachable.md");
    await Deno.writeTextFile(
      sourcePath,
      `# Fallback unreachable

\`\`\`plantuml
@startuml
Alice -> Bob
@enduml
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
        failOnError: false,
        locale: "nl",
      },
    });
    const html = await Deno.readTextFile(result.outputPath);

    assertEquals(
      warnings.some((warning) =>
        warning.includes("diagram-a11y: Diagram rendering failed") &&
        warning.includes("kroki-unreachable")
      ),
      true,
    );
    assertStringIncludes(html, 'class="language-plantuml"');
    assertStringIncludes(html, "@startuml");
    assertStringIncludes(html, "Alice -> Bob");
    assertEquals(html.includes("kroki-image"), false);
    assertEquals(html.includes("diagram-expandable-source"), false);
  } finally {
    console.warn = originalWarn;
    await removeDir(tempRoot);
  }
});

Deno.test("convertMarkdown validates diagram metadata before contacting Kroki", async () => {
  const tempRoot = await makeTempDir();
  const mockKroki = startMockKroki();
  try {
    const sourceDir = join(tempRoot, "src");
    const outputDir = join(tempRoot, "build", "invalid-src");
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, "invalid-src.md");
    await Deno.writeTextFile(
      sourcePath,
      `# Invalid src

\`\`\`plantuml src="https://example.test/diagram.puml"
@startuml
Alice -> Bob
@enduml
\`\`\`
`,
    );

    const error = await assertRejects(
      () =>
        convertMarkdown({
          sourcePath,
          outputDir,
          repoRoot: tempRoot,
          diagrams: {
            krokiUrl: mockKroki.url,
            output: "img-html-base64",
            failOnError: true,
            locale: "nl",
          },
        }),
      DiagramError,
      "invalid-src",
    );

    assertEquals(error.category, "invalid-parameter");
    assertEquals(mockKroki.requests, []);
  } finally {
    await mockKroki.close();
    await removeDir(tempRoot);
  }
});

Deno.test({
  name:
    "opt-in: convertMarkdown renders PlantUML against a real Kroki endpoint",
  ignore: Deno.env.get("BSO_REAL_KROKI") !== "1",
  async fn() {
    const tempRoot = await makeTempDir();
    try {
      const krokiUrl = Deno.env.get("BSO_KROKI_URL") ?? "https://kroki.io";
      const html = await convertFixture(
        tempRoot,
        "diagram-plantuml.md",
        krokiUrl,
      );

      assertStringIncludes(html, 'class="kroki-image"');
      assertStringIncludes(html, 'alt="PlantUML diagram fixture"');
      assertStringIncludes(html, 'class="diagram-a11y-description"');
    } finally {
      await removeDir(tempRoot);
    }
  },
});
