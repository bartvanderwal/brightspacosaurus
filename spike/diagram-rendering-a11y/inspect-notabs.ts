/**
 * SPIKE helper — probe the NON-tabs (separate <details>) branch, which is the
 * no-JS-friendly form the Brightspace adapter (task 5) wants. In 0.6.2 the tabs
 * branch fires only when BOTH source and a11y are shown; showing just one yields
 * a standalone native <details>. We render twice (source-only, a11y-only) to see
 * what each standalone disclosure looks like.
 */
import remarkKrokiA11y from "npm:remark-kroki-a11y@0.6.2";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "npm:rehype-raw@^7.0.0";
import rehypeStringify from "rehype-stringify";

const MD = [
  '```plantuml imgType="plantuml" imgTitle="Bestellingdomein"',
  "@startuml",
  "class Order",
  "class Customer",
  "Customer --> Order",
  "@enduml",
  "```",
  "",
].join("\n");

async function render(opts: Record<string, unknown>, label: string) {
  const html = String(
    await unified()
      .use(remarkParse)
      .use(remarkKrokiA11y, {
        languages: ["plantuml", "mermaid", "kroki"],
        locale: "nl",
        // skipKrokiRender avoids the network; we only want the a11y/source AST here.
        skipKrokiRender: true,
        ...opts,
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(MD),
  );
  console.log(`\n===== ${label} =====`);
  console.log(html.replace(/(src="data:image\/svg\+xml;base64,)[^"]+"/g, '$1…"'));
}

// Source only -> standalone <details> (no tabs, no JS).
await render({ showSource: true, showA11yDescription: false }, "source-only (no tabs)");
// A11y only -> standalone <details> (no tabs, no JS).
await render({ showSource: false, showA11yDescription: true }, "a11y-only (no tabs)");
