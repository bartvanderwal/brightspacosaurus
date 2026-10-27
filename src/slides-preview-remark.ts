/**
 * Invisible per-document slide metadata, independent of Docusaurus slugs/routes.
 * @module
 */
/** Prefix of the entries that mark a lesson presentation (see `slides-preview.ts`). */
const LESSON_KEY_PREFIX = "lesson:";

/** Prefix of the entries with the extra slides of a lesson presentation. */
const EXTRA_KEY_PREFIX = "extra:";

/** Prefix of the entries with the line of links at the top of a lesson page. */
const LINKS_KEY_PREFIX = "links:";

/**
 * The line of links to the slides and the pptx files after the first heading of
 * the lesson, the same line that the cartridge shows (rule T6).
 */
function insertLinksLine(
  tree: { children: unknown[] },
  json: string | undefined,
  base: string,
): void {
  if (!json) return;
  const items: { href: string; text: string; download: boolean }[] = JSON
    .parse(json);
  if (!items.length) return;
  const children: unknown[] = [];
  items.forEach((item, index) => {
    if (index) children.push({ type: "text", value: " · " });
    children.push({
      type: "mdxJsxTextElement",
      name: "a",
      attributes: [
        { type: "mdxJsxAttribute", name: "href", value: `${base}${item.href}` },
        // The presentations are static files that Docusaurus does not know as routes.
        {
          type: "mdxJsxAttribute",
          name: "data-noBrokenLinkCheck",
          value: null,
        },
        ...(item.download
          ? [{ type: "mdxJsxAttribute", name: "download", value: null }]
          : []),
      ],
      children: [{ type: "text", value: item.text }],
    });
  });
  const heading = tree.children.findIndex((node) =>
    (node as { type?: string; depth?: number }).type === "heading" &&
    (node as { depth?: number }).depth === 1
  );
  tree.children.splice(heading + 1, 0, { type: "paragraph", children });
}

export function remarkPreviewSlides(
  options: { lessons: Record<string, string>; baseUrl?: string },
): (tree: { children: unknown[] }, file: { path?: string }) => void {
  const base = (options.baseUrl ?? "/").replace(/\/?$/, "/");
  return (tree: { children: unknown[] }, file: { path?: string }) => {
    if (!file.path) return;
    // A lesson whose deck is generated from the lesson itself is presented with Alt+T;
    // its extra slides (a deck the lesson links) are the ones of Alt+P and the button.
    const presentation = options.lessons[LESSON_KEY_PREFIX + file.path];
    const extra = presentation !== undefined
      ? options.lessons[EXTRA_KEY_PREFIX + file.path]
      : options.lessons[file.path];
    if (!presentation && !extra) return;
    insertLinksLine(tree, options.lessons[LINKS_KEY_PREFIX + file.path], base);
    const attribute = (name: string, value: string | null) => ({
      type: "mdxJsxAttribute",
      name,
      value,
    });
    tree.children.push({
      type: "mdxJsxFlowElement",
      name: "span",
      attributes: [
        attribute("hidden", null),
        ...(extra ? [attribute("data-bso-slides", `${base}${extra}`)] : []),
        ...(presentation
          ? [attribute("data-bso-slides-lesson", `${base}${presentation}`)]
          : []),
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
            // The presentation is a static file that Docusaurus does not know as a
            // route, so its check for broken links would fail the build. A JSX link
            // can say `data-noBrokenLinkCheck` as Docusaurus spells it.
            const href = `${base}${url}${anchor ? `#${anchor}` : ""}`;
            node.type = "mdxJsxTextElement";
            node.name = "a";
            node.attributes = [
              { type: "mdxJsxAttribute", name: "href", value: href },
              {
                type: "mdxJsxAttribute",
                name: "data-noBrokenLinkCheck",
                value: null,
              },
            ];
            delete node.url;
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
