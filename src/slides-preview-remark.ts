/**
 * Invisible per-document slide metadata, independent of Docusaurus slugs/routes.
 * @module
 */
export function remarkPreviewSlides(
  options: { lessons: Record<string, string>; baseUrl?: string },
): (tree: { children: unknown[] }, file: { path?: string }) => void {
  return (tree: { children: unknown[] }, file: { path?: string }) => {
    const slides = file.path ? options.lessons[file.path] : undefined;
    if (!slides) return;
    tree.children.push({
      type: "mdxJsxFlowElement",
      name: "span",
      attributes: [
        { type: "mdxJsxAttribute", name: "hidden", value: null },
        {
          type: "mdxJsxAttribute",
          name: "data-bso-slides",
          value: `${(options.baseUrl ?? "/").replace(/\/?$/, "/")}${slides}`,
        },
      ],
      children: [],
    });
  };
}

/** Prefix of the entries that stand for the standalone presentation of a linked slide deck. */
const DECK_KEY_PREFIX = "deck:";

interface LinkNode {
  type: string;
  url?: string;
  name?: string;
  attributes?: unknown[];
  children?: LinkNode[];
}

/**
 * Points a link to a slide deck (a `.md` file that `bso preview` rendered as a
 * presentation) at that presentation, so the lesson page links to the slides
 * and Docusaurus does not try to resolve the slide deck as a doc. Pass the
 * same map as `remarkPreviewSlides`; its `deck:<path>` entries are the slide decks.
 * Register it in `beforeDefaultRemarkPlugins`.
 */
export function remarkPreviewDeckLinks(
  options: {
    lessons: Record<string, string>;
    baseUrl?: string;
    /**
     * Whether a file is a slide deck. Only used for a link that has no
     * rendered presentation (a build without `bso preview`): the link becomes
     * plain text, so the slide deck is not an unresolved doc link. Defaults to
     * reading the file with Node.
     */
    isDeck?: (path: string) => boolean;
  },
): (tree: LinkNode, file: { path?: string }) => void {
  const normalize = (path: string) => path.replaceAll("\\", "/");
  const decks = new Map(
    Object.entries(options.lessons)
      .filter(([key]) => key.startsWith(DECK_KEY_PREFIX))
      .map(([key, url]) => [normalize(key.slice(DECK_KEY_PREFIX.length)), url]),
  );
  const base = (options.baseUrl ?? "/").replace(/\/?$/, "/");
  const isDeck = options.isDeck ?? ((path: string) => {
    // deno-lint-ignore no-explicit-any
    const fs = (globalThis as any).process?.getBuiltinModule?.("node:fs");
    try {
      return /^---[ \t]*\r?\n[\s\S]*?^(?:slides|marp)[ \t]*:[ \t]*true\b/m
        .test(fs?.readFileSync(path, "utf8") ?? "");
    } catch {
      return false;
    }
  });
  return (tree: LinkNode, file: { path?: string }) => {
    if (!file.path) return;
    const directory = normalize(file.path).replace(/\/[^/]*$/, "/");
    const visit = (node: LinkNode): void => {
      if (node.type === "link" && node.url && /\.md(?:#|$)/i.test(node.url)) {
        const [target, anchor] = node.url.split("#", 2);
        if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) {
          const path = decodeURIComponent(
            new URL(
              encodeURI(target),
              `file://${directory.startsWith("/") ? "" : "/"}${directory}`,
            ).pathname,
          );
          const url = decks.get(path) ??
            decks.get(path.replace(/^\/([A-Za-z]:)/, "$1"));
          if (url) {
            node.url = `${base}${url}${anchor ? `#${anchor}` : ""}`;
          } else if (isDeck(path)) {
            // No presentation was rendered: keep the text, drop the link.
            node.type = "mdxJsxTextElement";
            node.name = "span";
            node.attributes = [];
            delete node.url;
          }
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
