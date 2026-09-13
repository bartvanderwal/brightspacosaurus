/**
 * Property tests for the Brightspace diagram adapter.
 *
 * Feature: diagram-rendering-a11y, Properties 1-4
 * Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.8
 */

import { assert, assertEquals } from "@std/assert";
import fc from "fast-check";
import { rehypeBrightspaceDiagramAdapter } from "../src/diagram-adapter.ts";

interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

function textNode(value: string): HastNode {
  return { type: "text", value };
}

function element(
  tagName: string,
  properties: Record<string, unknown>,
  children: HastNode[] = [],
): HastNode {
  return { type: "element", tagName, properties, children };
}

function textContent(node: HastNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textContent).join("");
}

function classList(node: HastNode): string[] {
  const className = node.properties?.className;
  if (Array.isArray(className)) return className.map(String);
  if (typeof className === "string") {
    return className.split(/\s+/).filter(Boolean);
  }
  return [];
}

function hasClass(node: HastNode, className: string): boolean {
  return classList(node).includes(className);
}

function findAll(
  node: HastNode,
  predicate: (node: HastNode) => boolean,
): HastNode[] {
  const matches = predicate(node) ? [node] : [];
  for (const child of node.children ?? []) {
    matches.push(...findAll(child, predicate));
  }
  return matches;
}

function makeRemarkKrokiA11yLikeTree(input: {
  alt?: string;
  source: string;
  description: string;
  svg?: boolean;
}): HastNode {
  const diagramNode = input.svg
    ? element("p", {
      className: ["kroki-inline-svg"],
      dataAlt: input.alt ?? "Diagram title",
    }, [
      element("svg", { xmlns: "http://www.w3.org/2000/svg" }, [
        element("title", {}, [textNode("Upstream title")]),
      ]),
    ])
    : element("p", {}, [
      element("img", {
        className: ["kroki-image"],
        src: "data:image/svg+xml;base64,PHN2Zy8+",
        alt: input.alt ?? "Diagram title",
      }),
    ]);

  return {
    type: "root",
    children: [
      diagramNode,
      element("details", {
        className: ["diagram-expandable-source"],
        lang: "nl",
      }, [
        element("summary", {}, [textNode("PlantUML broncode")]),
        element("div", { className: ["diagram-expandable-source-tabs"] }, [
          element("div", { role: "tablist" }, [
            element("button", { dataTab: "source" }, [textNode("Broncode")]),
            element("button", { dataTab: "a11y" }, [
              textNode("In natuurlijke taal"),
            ]),
          ]),
          element("section", { dataTab: "source" }, [
            element("pre", {}, [
              element("code", {}, [textNode(input.source)]),
            ]),
          ]),
          element("section", { dataTab: "a11y" }, [
            element("p", {
              className: ["diagram-a11y-description-text"],
              id: "upstream-description-id",
            }, [textNode(input.description)]),
          ]),
        ]),
      ]),
    ],
  };
}

const readableTextArb = fc.stringMatching(
  /^[A-Za-z0-9 .,:;_+\-()[\]{}]{1,80}$/,
);
const nonBlankTextArb = readableTextArb.filter((text) =>
  text.trim().length > 0
);
const sourceArb = fc
  .array(fc.stringMatching(/^[A-Za-z0-9 .,:;_+\-()[\]{}>"'=]{0,60}$/), {
    minLength: 1,
    maxLength: 8,
  })
  .map((lines) => lines.join("\n"));

Deno.test("Properties 1 and 4: adapter produces no-JS native disclosures and preserves source", () => {
  fc.assert(
    fc.property(sourceArb, nonBlankTextArb, (source, description) => {
      const tree = makeRemarkKrokiA11yLikeTree({ source, description });
      rehypeBrightspaceDiagramAdapter()(tree);

      assertEquals(
        findAll(tree, (node) => node.tagName === "script").length,
        0,
      );
      assertEquals(
        findAll(tree, (node) => node.tagName === "button").length,
        0,
      );
      assertEquals(
        findAll(tree, (node) => node.properties?.role === "tablist").length,
        0,
      );

      const details = findAll(tree, (node) => node.tagName === "details");
      assertEquals(details.length, 2);
      for (const disclosure of details) {
        const summary = (disclosure.children ?? []).find((child) =>
          child.tagName === "summary"
        );
        assert(summary);
        assert(textContent(summary).trim().length > 0);
      }

      const sourceCode = findAll(tree, (node) => node.tagName === "code")[0];
      assertEquals(textContent(sourceCode), source);

      const descriptionDetails = details.find((node) =>
        hasClass(node, "diagram-a11y-description")
      );
      assert(descriptionDetails);
      assertEquals(
        findAll(descriptionDetails, (node) => node.tagName === "img").length,
        0,
      );
      assertEquals(textContent(descriptionDetails).includes(description), true);
    }),
    { numRuns: 100 },
  );
});

Deno.test("Properties 2 and 3: adapter uses stable IDs and image ARIA references", () => {
  fc.assert(
    fc.property(
      nonBlankTextArb,
      sourceArb,
      nonBlankTextArb,
      (alt, source, description) => {
        const first = makeRemarkKrokiA11yLikeTree({ alt, source, description });
        const second = makeRemarkKrokiA11yLikeTree({
          alt,
          source,
          description,
        });

        rehypeBrightspaceDiagramAdapter()(first);
        rehypeBrightspaceDiagramAdapter()(second);

        assertEquals(first, second);

        const image = findAll(first, (node) => node.tagName === "img")[0];
        const descriptionText = findAll(
          first,
          (node) => hasClass(node, "diagram-a11y-description-text"),
        )[0];

        assertEquals(image.properties?.alt, alt.trim());
        assertEquals(
          image.properties?.ariaDescribedBy,
          "bso-diagram-1-description",
        );
        assertEquals(
          descriptionText.properties?.id,
          "bso-diagram-1-description",
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("Property 3: adapter gives inline SVG an accessible name and description reference", () => {
  fc.assert(
    fc.property(
      nonBlankTextArb,
      sourceArb,
      nonBlankTextArb,
      (alt, source, description) => {
        const tree = makeRemarkKrokiA11yLikeTree({
          alt,
          source,
          description,
          svg: true,
        });
        rehypeBrightspaceDiagramAdapter()(tree);

        const svg = findAll(tree, (node) => node.tagName === "svg")[0];
        const title = findAll(svg, (node) => node.tagName === "title")[0];
        const descriptionText = findAll(
          tree,
          (node) => hasClass(node, "diagram-a11y-description-text"),
        )[0];

        assertEquals(svg.properties?.role, "img");
        assertEquals(svg.properties?.ariaLabelledBy, "bso-diagram-1-title");
        assertEquals(
          svg.properties?.ariaDescribedBy,
          "bso-diagram-1-description",
        );
        assertEquals(title.properties?.id, "bso-diagram-1-title");
        assertEquals(textContent(title), alt);
        assertEquals(
          descriptionText.properties?.id,
          "bso-diagram-1-description",
        );
      },
    ),
    { numRuns: 100 },
  );
});

Deno.test("Property 3: adapter warns instead of inventing fallback alt text for unnamed image diagrams", () => {
  const tree = makeRemarkKrokiA11yLikeTree({
    alt: "",
    source: "@startuml\nAlice -> Bob\n@enduml",
    description: "Alice stuurt een bericht naar Bob.",
  });
  const warnings: string[] = [];

  rehypeBrightspaceDiagramAdapter()(tree, {
    message(reason: string) {
      warnings.push(reason);
    },
  });

  const image = findAll(tree, (node) => node.tagName === "img")[0];
  assertEquals(image.properties?.alt, "");
  assertEquals(
    warnings.some((warning) => warning.includes("no accessible image name")),
    true,
  );
});
