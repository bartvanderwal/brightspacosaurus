/**
 * Preview parity tests for shared diagram configuration.
 *
 * Feature: diagram-rendering-a11y
 * Validates: Requirements 7.1, 7.2, 7.3
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { basename, join } from "@std/path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import { convertMarkdown } from "../src/markdown-converter.ts";
import { withDiagramRendering } from "../src/diagram-renderer.ts";
import { buildKrokiA11yOptions } from "../src/diagram-config.ts";
import type { ResolvedDiagramConfig } from "../src/types.ts";
import {
  createDiagramRemarkPlugins,
  previewDiagramConfig,
} from "./fixtures/docusaurus-preview/docusaurus.config.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({
    prefix: "brightspacosaurus_preview_parity_",
  });
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

async function renderPreview(
  markdown: string,
  cfg: ResolvedDiagramConfig,
  sourcePath: string,
): Promise<string> {
  let processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm);

  processor = withDiagramRendering(processor, cfg, sourcePath);

  return String(
    await processor
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(markdown),
  );
}

Deno.test("Docusaurus preview fixture uses the same shared diagram options as BSO", () => {
  const plugins = createDiagramRemarkPlugins(previewDiagramConfig);
  assertEquals(plugins.length, 1);
  assertEquals(plugins[0][1], buildKrokiA11yOptions(previewDiagramConfig));
});

Deno.test("Docusaurus preview and Brightspace output contain equivalent diagram content", async () => {
  const tempRoot = await makeTempDir();
  const mockKroki = startMockKroki();
  try {
    const fixtureName = "diagram-plantuml.md";
    const markdown = await Deno.readTextFile(
      join("tests", "fixtures", fixtureName),
    );
    const cfg: ResolvedDiagramConfig = {
      krokiUrl: mockKroki.url,
      output: "img-html-base64",
      failOnError: true,
      locale: "nl",
    };
    const sourceDir = join(tempRoot, "src");
    const outputDir = join(tempRoot, "build", basename(fixtureName, ".md"));
    await Deno.mkdir(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, fixtureName);
    await Deno.writeTextFile(sourcePath, markdown);

    const previewHtml = await renderPreview(markdown, cfg, sourcePath);
    const result = await convertMarkdown({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
      diagrams: cfg,
    });
    const brightspaceHtml = await Deno.readTextFile(result.outputPath);

    assertEquals(mockKroki.requests.includes("POST /plantuml/svg"), true);
    for (const html of [previewHtml, brightspaceHtml]) {
      assertStringIncludes(html, 'class="kroki-image"');
      assertStringIncludes(html, 'alt="PlantUML diagram fixture"');
      assertStringIncludes(html, "@startuml");
      assertStringIncludes(html, "Course");
      assertStringIncludes(html, "enrolls in");
      assertStringIncludes(html, "Klassendiagram");
    }
  } finally {
    await mockKroki.close();
    await removeDir(tempRoot);
  }
});
