/**
 * Thin Brightspace adaptation for `remark-kroki-a11y` output.
 * Keeps generated labels/descriptions/source intact, but removes tab wiring so
 * source and natural-language description are native no-JS disclosures.
 */

interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

interface DiagramAdapterWarningTarget {
  message?: (reason: string) => unknown;
}

interface AdaptedDetails {
  nodes: HastNode[];
  descriptionId?: string;
  missingDescription: boolean;
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

function dataTab(node: HastNode): string | undefined {
  const value = node.properties?.dataTab ?? node.properties?.["data-tab"];
  return typeof value === "string" ? value : undefined;
}

function textContent(node: HastNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textContent).join("");
}

function cloneElement(node: HastNode, children: HastNode[]): HastNode {
  return {
    ...node,
    properties: { ...(node.properties ?? {}) },
    children,
  };
}

function findDescendant(
  node: HastNode,
  predicate: (node: HastNode) => boolean,
): HastNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = findDescendant(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function findPreviousDiagramNode(
  siblings: HastNode[],
  index: number,
): { wrapper?: HastNode; image?: HastNode; svg?: HastNode } | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const image = findDescendant(
      siblings[i],
      (candidate) =>
        candidate.tagName === "img" && hasClass(candidate, "kroki-image"),
    );
    if (image) {
      return { image };
    }

    const wrapper = findDescendant(
      siblings[i],
      (candidate) => hasClass(candidate, "kroki-inline-svg"),
    );
    const svg = wrapper
      ? findDescendant(wrapper, (candidate) => candidate.tagName === "svg")
      : undefined;
    if (wrapper && svg) {
      return { wrapper, svg };
    }
  }
  return undefined;
}

function setOrReplaceTitle(
  svg: HastNode,
  titleId: string,
  title: string,
): void {
  const children = svg.children ?? [];
  const existingTitle = children.find((child) => child.tagName === "title");
  const titleNode: HastNode = {
    type: "element",
    tagName: "title",
    properties: { id: titleId },
    children: [{ type: "text", value: title }],
  };

  if (existingTitle) {
    existingTitle.properties = {
      ...(existingTitle.properties ?? {}),
      id: titleId,
    };
    existingTitle.children = titleNode.children;
  } else {
    svg.children = [titleNode, ...children];
  }
}

function wireDiagramAccessibility(
  siblings: HastNode[],
  index: number,
  diagramIndex: number,
  descriptionId: string | undefined,
  warnings: string[],
): void {
  const diagram = findPreviousDiagramNode(siblings, index);
  if (!diagram) return;

  if (diagram.image) {
    const existingAlt = typeof diagram.image.properties?.alt === "string"
      ? diagram.image.properties.alt.trim()
      : "";
    if (!existingAlt) {
      warnings.push(
        `Diagram ${diagramIndex} has no accessible image name; add a heading or imgTitle metadata before exporting.`,
      );
    }
    diagram.image.properties = {
      ...(diagram.image.properties ?? {}),
      alt: existingAlt,
      ...(descriptionId ? { ariaDescribedBy: descriptionId } : {}),
    };
    return;
  }

  if (diagram.svg) {
    const titleId = `bso-diagram-${diagramIndex}-title`;
    const title = typeof diagram.wrapper?.properties?.dataAlt === "string" &&
        diagram.wrapper.properties.dataAlt.trim()
      ? diagram.wrapper.properties.dataAlt
      : "Diagram";
    if (title === "Diagram") {
      warnings.push(
        `Diagram ${diagramIndex} has no accessible image name; add a heading or imgTitle metadata before exporting.`,
      );
    }
    setOrReplaceTitle(diagram.svg, titleId, title);
    diagram.svg.properties = {
      ...(diagram.svg.properties ?? {}),
      role: "img",
      ariaLabelledBy: titleId,
      ...(descriptionId ? { ariaDescribedBy: descriptionId } : {}),
    };
  }
}

function adaptTabbedDetails(
  node: HastNode,
  diagramIndex: number,
): AdaptedDetails | null {
  if (
    node.tagName !== "details" || !hasClass(node, "diagram-expandable-source")
  ) {
    return null;
  }

  const tabs = findDescendant(
    node,
    (candidate) => hasClass(candidate, "diagram-expandable-source-tabs"),
  );
  if (!tabs) return null;

  const summary = (node.children ?? []).find((child) =>
    child.tagName === "summary"
  );
  const sourcePanel = findDescendant(
    tabs,
    (candidate) =>
      candidate.tagName === "section" && dataTab(candidate) === "source",
  );
  const a11yPanel = findDescendant(
    tabs,
    (candidate) =>
      candidate.tagName === "section" && dataTab(candidate) === "a11y",
  );
  if (!summary || !sourcePanel) return null;

  const a11yButton = findDescendant(
    tabs,
    (candidate) =>
      candidate.tagName === "button" && dataTab(candidate) === "a11y",
  );
  const a11ySummary = textContent(a11yButton).trim() || "In natuurlijke taal";

  const sourceDetails = cloneElement(node, [
    summary,
    ...(sourcePanel.children ?? []),
  ]);

  const descriptionNode = a11yPanel
    ? findDescendant(
      a11yPanel,
      (candidate) => hasClass(candidate, "diagram-a11y-description-text"),
    )
    : undefined;
  const hasDescription = Boolean(
    descriptionNode && textContent(descriptionNode).trim(),
  );

  if (!a11yPanel || !hasDescription) {
    return {
      nodes: [sourceDetails],
      missingDescription: true,
    };
  }

  const descriptionId = `bso-diagram-${diagramIndex}-description`;
  descriptionNode!.properties = {
    ...(descriptionNode!.properties ?? {}),
    id: descriptionId,
  };

  const a11yDetails: HastNode = {
    type: "element",
    tagName: "details",
    properties: {
      className: ["diagram-a11y-description"],
      ...(node.properties?.lang ? { lang: node.properties.lang } : {}),
    },
    children: [
      {
        type: "element",
        tagName: "summary",
        properties: {},
        children: [{ type: "text", value: a11ySummary }],
      },
      ...(a11yPanel.children ?? []),
    ],
  };

  return {
    nodes: [sourceDetails, a11yDetails],
    descriptionId,
    missingDescription: false,
  };
}

function adaptChildren(
  parent: HastNode,
  state: { diagramIndex: number; warnings: string[] },
): void {
  const children = parent.children;
  if (!children) return;

  for (let i = 0; i < children.length; i += 1) {
    adaptChildren(children[i], state);
    const nextDiagramIndex = state.diagramIndex + 1;
    const adapted = adaptTabbedDetails(children[i], nextDiagramIndex);
    if (adapted) {
      state.diagramIndex = nextDiagramIndex;
      if (adapted.missingDescription) {
        state.warnings.push(
          `Diagram ${state.diagramIndex} has no natural-language description; retained the diagram and source disclosure.`,
        );
      }
      children.splice(i, 1, ...adapted.nodes);
      wireDiagramAccessibility(
        children,
        i,
        state.diagramIndex,
        adapted.descriptionId,
        state.warnings,
      );
      i += adapted.nodes.length - 1;
    }
  }
}

/**
 * Creates a rehype plugin that adapts `remark-kroki-a11y` output for Brightspace.
 *
 * The adapter keeps source and natural-language descriptions accessible through
 * native HTML controls and wires generated diagrams with ARIA labels where
 * possible, without relying on client-side JavaScript.
 */
export function rehypeBrightspaceDiagramAdapter(): (
  tree: HastNode,
  file?: DiagramAdapterWarningTarget,
) => void {
  return (tree: HastNode, file?: DiagramAdapterWarningTarget) => {
    const state = { diagramIndex: 0, warnings: [] as string[] };
    adaptChildren(tree, state);
    for (const warning of state.warnings) {
      file?.message?.(warning);
      console.warn(`diagram-a11y: ${warning}`);
    }
  };
}
