/**
 * Diagrams in quiz questions (#101): PlantUML/Mermaid fences become an image
 * with source and natural-language description, in the QTI export.
 */
import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import fc from "fast-check";
import { convertQuiz } from "../src/quiz-converter.ts";
import { titleDiagramFences } from "../src/quiz-diagram-fields.ts";
import { parseQuizText } from "../src/quiz-markdown.ts";
import type { ResolvedDiagramConfig } from "../src/types.ts";

function startMockKroki() {
  const controller = new AbortController();
  let requests = 0;
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: controller.signal,
    onListen: () => undefined,
  }, async (request) => {
    requests++;
    const source = await request.text();
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg"><title>${source}</title></svg>`,
      { headers: { "content-type": "image/svg+xml" } },
    );
  });
  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    get requests() {
      return requests;
    },
    async close() {
      controller.abort();
      await server.finished.catch(() => undefined);
    },
  };
}

const diagramConfig = (
  krokiUrl: string,
  overrides: Partial<ResolvedDiagramConfig> = {},
): ResolvedDiagramConfig => ({
  krokiUrl,
  output: "img-html-base64",
  failOnError: true,
  locale: "nl",
  ...overrides,
});

const QUIZ = `# Diagrammen

\`\`\`\`quiz
? Welk klassendiagram hoort bij de code?

\`\`\`plantuml
@startuml
class A
class B
A --> B
@enduml
\`\`\`

- (x) Dit diagram:
  \`\`\`plantuml
  @startuml
  class C
  @enduml
  \`\`\`
- ( ) Geen van beide
\`\`\`\`
`;

async function convert(
  krokiUrl: string,
  overrides: Partial<ResolvedDiagramConfig> = {},
  quiz = QUIZ,
) {
  await Deno.mkdir("build", { recursive: true });
  const root = await Deno.makeTempDir({ dir: "build", prefix: "quiz-diagrams-" });
  const sources = join(root, "lessons");
  await Deno.mkdir(sources, { recursive: true });
  const sourcePath = join(sources, "quiz-diagrammen.md");
  await Deno.writeTextFile(sourcePath, quiz);
  const outputDir = join(root, "build", "quiz");
  const result = await convertQuiz({
    sourcePath,
    outputDir,
    repoRoot: root,
    sourcesDir: sources,
    locale: "nl",
    diagrams: diagramConfig(krokiUrl, overrides),
  });
  return { root, outputDir, xml: await Deno.readTextFile(result.outputPath) };
}

Deno.test("QTI export renders question and option diagrams with source and description", async () => {
  const kroki = startMockKroki();
  const { root, outputDir, xml } = await convert(kroki.url);
  try {
    // Brightspace does not import files only a quiz refers to, so the SVG stays
    // an inline data URI and no asset file is written (#105).
    const images = [...xml.matchAll(/src=&quot;data:image\/svg\+xml;base64,[A-Za-z0-9+\/=]+&quot;/g)];
    assertEquals(images.length, 2);
    assertEquals(xml.includes("assets/"), false);
    assertEquals(
      await Deno.stat(join(outputDir, "assets")).then(() => true, () => false),
      false,
    );
    // Source and natural-language description as native <details>, in the quiz language.
    assertStringIncludes(xml, "&lt;details");
    assertStringIncludes(xml, "In natuurlijke taal");
    assertStringIncludes(xml, "@startuml");
    // The question labels the image for a screen reader.
    assertStringIncludes(xml, "Vraag 1");
    assertStringIncludes(xml, "Vraag 1, antwoord A");
    assertEquals(xml.includes("plantuml diagram 1"), false);
    // Element ids stay unique across the whole quiz file.
    const ids = [...xml.matchAll(/ id=&quot;([^&]+)&quot;/g)].map((m) => m[1]);
    assertEquals(new Set(ids).size, ids.length);
    // Every image points at its own description (never at another diagram's).
    const described = [...xml.matchAll(/aria-describedby=&quot;([^&]+)&quot;/g)].map((m) => m[1]);
    assertEquals(described.length, 2);
    assertEquals(new Set(described).size, 2);
    for (const id of described) assertEquals(ids.includes(id), true);
  } finally {
    await kroki.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("QTI export of diagrams is deterministic", async () => {
  const kroki = startMockKroki();
  const first = await convert(kroki.url);
  const second = await convert(kroki.url);
  try {
    assertEquals(second.xml, first.xml);
  } finally {
    await kroki.close();
    await Deno.remove(first.root, { recursive: true });
    await Deno.remove(second.root, { recursive: true });
  }
});

Deno.test("an author's imgTitle wins over the generated question title", async () => {
  const kroki = startMockKroki();
  const quiz = QUIZ.replace("```plantuml\n@startuml\nclass A", '```plantuml imgTitle="Mijn eigen titel"\n@startuml\nclass A');
  const { root, xml } = await convert(kroki.url, {}, quiz);
  try {
    assertStringIncludes(xml, "Mijn eigen titel");
  } finally {
    await kroki.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("an unreachable Kroki fails the build, or keeps the fence with failOnError false", async () => {
  const kroki = startMockKroki();
  const dead = kroki.url;
  await kroki.close();
  const failing = await Deno.makeTempDir({ dir: "build", prefix: "quiz-diagrams-" }).catch(async () => {
    await Deno.mkdir("build", { recursive: true });
    return await Deno.makeTempDir({ dir: "build", prefix: "quiz-diagrams-" });
  });
  await Deno.remove(failing, { recursive: true });
  await assertRejects(() => convert(dead), Error, "kroki-unreachable");
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message: string) => warnings.push(String(message));
  try {
    const { root, xml } = await convert(dead, { failOnError: false });
    assertStringIncludes(xml, "@startuml");
    assertEquals(xml.includes("assets/"), false);
    assertEquals(warnings.length > 0, true);
    await Deno.remove(root, { recursive: true });
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("a quiz without diagrams never calls Kroki", async () => {
  const kroki = startMockKroki();
  const { root } = await convert(
    kroki.url,
    {},
    "# Zonder\n\n````quiz\n? Vraag?\n\n- (x) Ja\n- ( ) Nee\n````\n",
  );
  try {
    assertEquals(kroki.requests, 0);
  } finally {
    await kroki.close();
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("titleDiagramFences titles only fences without imgTitle, for any title", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 40 }), (title) => {
      const root = parseQuizText(
        "```plantuml\n@startuml\n@enduml\n```\n\n```mermaid imgTitle=\"Eigen\"\ngraph LR\n```\n\n```java\nclass A {}\n```",
      );
      titleDiagramFences(root.children ?? [], title);
      const [plantuml, mermaid, java] = root.children ?? [];
      assertEquals(
        plantuml.meta,
        `imgTitle="${title.replaceAll('"', "'")}"`,
      );
      assertEquals(mermaid.meta, 'imgTitle="Eigen"');
      assertEquals(java.meta ?? null, null);
    }),
    { numRuns: 100 },
  );
});

Deno.test("raw HTML typed by an author never reaches the QTI, with or without diagrams", async () => {
  const kroki = startMockKroki();
  const quiz = QUIZ.replace("? Welk klassendiagram hoort bij de code?", "? Welk klassendiagram hoort bij de code? <script>alert(1)</script><b>x</b>");
  const { root, xml } = await convert(kroki.url, {}, quiz);
  try {
    assertEquals(xml.includes("&lt;script"), false);
    assertEquals(xml.includes("alert(1)</script>"), false);
    assertEquals(xml.includes("&lt;b&gt;x&lt;/b&gt;"), false);
  } finally {
    await kroki.close();
    await Deno.remove(root, { recursive: true });
  }
});
