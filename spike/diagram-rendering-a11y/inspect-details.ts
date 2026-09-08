/**
 * SPIKE helper — dump the <details>/<summary> + description content so the
 * FINDINGS note can quote the a11y structure accurately (not the giant base64).
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
  "class Order {",
  "  +id: int",
  "}",
  "class Customer",
  "Customer --> Order",
  "@enduml",
  "```",
  "",
].join("\n");

const html = String(
  await unified()
    .use(remarkParse)
    .use(remarkKrokiA11y, {
      languages: ["plantuml", "mermaid", "kroki"],
      locale: "nl",
      kroki: { krokiBase: "https://kroki.io", output: "img-html-base64", target: "html" },
    })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(MD),
);

// Strip the huge base64 payload so the a11y structure is readable.
const readable = html.replace(/(src="data:image\/svg\+xml;base64,)[^"]+"/g, '$1…"');
console.log(readable);
