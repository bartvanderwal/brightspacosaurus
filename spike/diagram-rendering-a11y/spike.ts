/**
 * SPIKE — diagram-rendering-a11y, task 1.1 (Beslissing 1)
 *
 * GOAL (informative prototype, NOT production code):
 * Determine whether `remark-kroki-a11y@0.6.2` runs IN-PROCESS under Deno's
 * npm-compat (Option A) or whether a Node subprocess is needed (Option B).
 *
 * The a11y wrapper (remark-kroki-a11y) is CommonJS: it uses `require`,
 * Node `fs`/`path`, and dynamically loads its ESM rendering backend via
 * `import('remark-kroki')`. That CJS+dynamic-import combination is the
 * riskiest part for Deno npm-compat, so this spike exercises exactly that path.
 *
 * It processes ONE PlantUML and ONE Mermaid fixture through a minimal unified
 * pipeline, ASYNCHRONOUSLY (the Kroki render is an async network call), against
 * the PUBLIC endpoint https://kroki.io (so Mermaid works without the
 * yuzutech/kroki-mermaid companion that a local Docker Kroki would require).
 *
 * It tries both output modes: `img-html-base64` (default) and `inline-svg`.
 *
 * Run: see spike/diagram-rendering-a11y/FINDINGS.md for exact flags.
 */

// npm-compat specifier, pinned to the just-published 0.6.2.
import remarkKrokiA11y from "npm:remark-kroki-a11y@0.6.2";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "npm:rehype-raw@^7.0.0";
import rehypeStringify from "rehype-stringify";

const KROKI_URL = "https://kroki.io";

// --- Fixtures (small inline strings) -------------------------------------

// The a11y wrapper matches code blocks whose `lang` is in `options.languages`.
// It reads the diagram type from an `imgType="..."` fence-meta attribute, which
// also drives the natural-language description parser selection.
const PLANTUML_FIXTURE = [
  '```plantuml imgType="plantuml" imgTitle="Bestellingdomein"',
  "@startuml",
  "class Order {",
  "  +id: int",
  "  +total: double",
  "}",
  "class Customer {",
  "  +name: string",
  "}",
  "Customer --> Order",
  "@enduml",
  "```",
  "",
].join("\n");

const MERMAID_FIXTURE = [
  '```mermaid imgType="mermaid" imgTitle="Login flow"',
  "flowchart TD",
  "  A[Start] --> B{Logged in?}",
  "  B -->|Yes| C[Dashboard]",
  "  B -->|No| D[Login page]",
  "```",
  "",
].join("\n");

// --- Pipeline ------------------------------------------------------------

function buildProcessor(output: string) {
  return unified()
    .use(remarkParse)
    // The wrapper inserts native <details>/<summary> HTML nodes and (via its
    // dynamic import of remark-kroki) rewrites the code node into a diagram.
    .use(remarkKrokiA11y, {
      // Match the raw fenced-block languages we use in course material and
      // alias them so remark-kroki knows how to render them via Kroki.
      languages: ["plantuml", "mermaid", "kroki"],
      locale: "nl",
      showSource: true,
      showA11yDescription: true,
      // No-JS Brightspace target: keep the native <details>, no JS tab wiring.
      showDiagramModeToggle: false,
      kroki: {
        krokiBase: KROKI_URL,
        output, // 'img-html-base64' (default) or 'inline-svg'
        target: "html",
      },
    })
    // allowDangerousHtml so the raw HTML nodes survive into hast.
    .use(remarkRehype, { allowDangerousHtml: true })
    // rehype-raw re-parses the raw HTML strings into real hast nodes.
    .use(rehypeRaw)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

async function runOne(name: string, markdown: string, output: string) {
  const label = `${name} / ${output}`;
  try {
    const file = await buildProcessor(output).process(markdown);
    const html = String(file);
    const snippet = html.length > 900 ? html.slice(0, 900) + " …[truncated]" : html;

    const checks = {
      hasBase64Img: /<img[^>]*src="data:image\/svg\+xml;base64,/.test(html),
      hasInlineSvg: /<svg[\s>]/.test(html),
      hasImgAlt: /<img[^>]*\balt="[^"]+"/.test(html),
      hasDetails: /<details/.test(html),
      hasSummary: /<summary>/.test(html),
      hasScript: /<script/.test(html),
    };

    console.log(`\n===== OK: ${label} =====`);
    console.log("checks:", JSON.stringify(checks));
    console.log("--- output snippet ---");
    console.log(snippet);
    return { label, ok: true, checks };
  } catch (err) {
    console.log(`\n===== FAIL: ${label} =====`);
    console.log("error name:", (err as Error)?.name);
    console.log("error message:", (err as Error)?.message);
    if ((err as { cause?: unknown })?.cause) {
      console.log("cause:", String((err as { cause?: unknown }).cause));
    }
    console.log("stack:", (err as Error)?.stack);
    return { label, ok: false, error: String((err as Error)?.message ?? err) };
  }
}

if (import.meta.main) {
  console.log("Deno:", Deno.version.deno, "| Kroki:", KROKI_URL);
  const results = [];
  for (const output of ["img-html-base64", "inline-svg"]) {
    results.push(await runOne("plantuml", PLANTUML_FIXTURE, output));
    results.push(await runOne("mermaid", MERMAID_FIXTURE, output));
  }
  console.log("\n===== SUMMARY =====");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}`);
  }
  const allOk = results.every((r) => r.ok);
  console.log(`\nDECISION SIGNAL: ${allOk ? "Option A viable (in-process)" : "check errors above"}`);
}
