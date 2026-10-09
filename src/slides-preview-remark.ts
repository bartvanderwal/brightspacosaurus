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
