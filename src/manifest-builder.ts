/**
 * ManifestBuilder: generates a valid imsmanifest.xml for Common Cartridge 1.3.
 * Requirements: 2.1, 2.3
 */

import { ManifestEntry } from "./types.ts";

/**
 * Escapes XML special characters in a string.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extracts a group label based on the first subdirectory in the href path.
 * E.g. "content/week-1/les.html" → "week-1", "content/module-a/intro.html" → "module-a".
 * Files without a subdirectory (e.g. "content/index.html") return null.
 *
 * The grouping is generic: no course-specific mapping (such as week→level) is applied.
 */
function getGroupLabel(href: string): string | null {
  // Strip the leading "content/" or "quiz/" prefix if present
  const stripped = href.replace(/^(?:content|quiz)\//, "");
  // Find the first subdirectory (everything before the first '/' in the stripped path)
  const slashIdx = stripped.indexOf("/");
  if (slashIdx <= 0) return null;
  return stripped.substring(0, slashIdx);
}

function getFileStem(href: string): string {
  const fileName = href.split("/").pop() ?? href;
  return fileName.replace(/\.[^.]+$/, "");
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "nl", { numeric: true, sensitivity: "base" });
}

const READER_TITLE_WORDS: Record<string, string> = {
  api: "API",
  css: "CSS",
  git: "Git",
  github: "GitHub",
  gitlab: "GitLab",
  html: "HTML",
  http: "HTTP",
  javascript: "JavaScript",
  js: "JS",
  pdf: "PDF",
  plantuml: "PlantUML",
  qti: "QTI",
  svg: "SVG",
  typescript: "TypeScript",
  uml: "UML",
  url: "URL",
  xml: "XML",
};

function humanizeReaderWord(word: string, index: number): string {
  const normalized = word.toLowerCase();
  const mapped = READER_TITLE_WORDS[normalized];
  if (mapped) return mapped;
  if (index === 0) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return normalized;
}

export function deriveReaderMenuTitle(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/^reader[-_]/i, "");
  const title = stem
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map(humanizeReaderWord)
    .join(" ");
  return title ? `Reader ${title}` : "Reader";
}

function extractNavigationCode(entry: ManifestEntry): number[] | null {
  const candidates = [
    entry.title,
    getFileStem(entry.href).replace(/^qti-/, ""),
  ];

  for (const candidate of candidates) {
    const matches = candidate.match(/\d+(?:[.-]\d+)*/g) ?? [];
    const specific = matches.find((match) => /[.-]/.test(match));
    const selected = specific ?? matches[0];
    if (!selected) continue;

    return selected.split(/[.-]/)
      .map((part) => Number(part))
      .filter((part) => Number.isFinite(part));
  }

  return null;
}

function compareNavigationCodes(
  a: number[] | null,
  b: number[] | null,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function navigationTypeWeight(entry: ManifestEntry): number {
  return entry.type === "webcontent" ? 0 : 1;
}

function moduleLeadPageWeight(entry: ManifestEntry): number {
  if (entry.type !== "webcontent") return 1;

  const stem = getFileStem(entry.href).toLowerCase();
  return /^(?:weekintro|weekindex|intro|index|overview)(?:[-_.]\d+)?$/.test(
      stem,
    )
    ? 0
    : 1;
}

export function sortManifestEntriesForNavigation(
  entries: ManifestEntry[],
): ManifestEntry[] {
  return [...entries].sort((a, b) => {
    const groupCompare = naturalCompare(
      getGroupLabel(a.href) ?? "",
      getGroupLabel(b.href) ?? "",
    );
    if (groupCompare !== 0) return groupCompare;

    const moduleLeadCompare = moduleLeadPageWeight(a) - moduleLeadPageWeight(b);
    if (moduleLeadCompare !== 0) return moduleLeadCompare;

    const codeCompare = compareNavigationCodes(
      extractNavigationCode(a),
      extractNavigationCode(b),
    );
    if (codeCompare !== 0) return codeCompare;

    const typeCompare = navigationTypeWeight(a) - navigationTypeWeight(b);
    if (typeCompare !== 0) return typeCompare;

    const titleCompare = naturalCompare(a.title, b.title);
    if (titleCompare !== 0) return titleCompare;

    return naturalCompare(a.href, b.href);
  });
}

function buildOrganizationItems(entries: ManifestEntry[]): string {
  const groupedEntries = new Map<string, ManifestEntry[]>();
  const readerEntries: ManifestEntry[] = [];
  const ungroupedEntries: ManifestEntry[] = [];
  const docentenEntries: ManifestEntry[] = [];

  for (const entry of entries) {
    // Instructor items go into a separate hidden module
    if (
      entry.href.startsWith("content/docenten/") ||
      entry.href.startsWith("docenten/")
    ) {
      docentenEntries.push(entry);
      continue;
    }

    // Reader PDFs go under a single "Readers" module
    if (entry.href.startsWith("readers/")) {
      readerEntries.push(entry);
      continue;
    }

    // Group by the first subdirectory (e.g. "week-1", "module-a", "sad")
    const groupLabel = getGroupLabel(entry.href);
    if (!groupLabel) {
      ungroupedEntries.push(entry);
      continue;
    }

    const groupEntries = groupedEntries.get(groupLabel) ?? [];
    groupEntries.push(entry);
    groupedEntries.set(groupLabel, groupEntries);
  }

  const groupItems = [...groupedEntries.entries()].sort(([a], [b]) =>
    naturalCompare(a, b)
  ).map(([groupLabel, groupEntries]) => {
    const groupId = "group_" +
      groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(
        /^_|_$/g,
        "",
      );
    const childItems = sortManifestEntriesForNavigation(groupEntries).map(
      (entry) => {
        return `        <item identifier="item_${
          escapeXml(entry.id)
        }" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`;
      },
    ).join("\n");

    return `      <item identifier="${escapeXml(groupId)}">
        <title>${escapeXml(groupLabel)}</title>
${childItems}
      </item>`;
  });

  const looseItems = ungroupedEntries.map((entry) => {
    return `      <item identifier="item_${
      escapeXml(entry.id)
    }" identifierref="${escapeXml(entry.id)}">
        <title>${escapeXml(entry.title)}</title>
      </item>`;
  });

  // Readers module: all reader PDFs under a single heading
  const readersModule = readerEntries.length > 0
    ? [`      <item identifier="module_readers">
        <title>Readers</title>
${
      readerEntries.map((entry) =>
        `        <item identifier="item_${
          escapeXml(entry.id)
        }" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`
      ).join("\n")
    }
      </item>`]
    : [];

  // Instructor module: set to "Do not display" after import in Brightspace
  const docentenItems = docentenEntries.length > 0
    ? [`      <item identifier="module_docentenmateriaal">
        <title>Instructor material (hide after import)</title>
${
      docentenEntries.map((entry) =>
        `        <item identifier="item_${
          escapeXml(entry.id)
        }" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`
      ).join("\n")
    }
      </item>`]
    : [];

  return [...groupItems, ...looseItems, ...readersModule, ...docentenItems]
    .join("\n");
}

/**
 * Generates a valid imsmanifest.xml based on the course title and resource entries.
 *
 * Deterministic order: entries are included in the order in which they are supplied.
 * The caller sorts: HTML files by path, QTI files after them.
 *
 * @param courseTitle - Human-readable course title
 * @param entries - Resource entries (HTML web content + QTI assessments)
 * @returns Complete XML string of the manifest
 */
export function buildManifest(
  courseTitle: string,
  entries: ManifestEntry[],
): string {
  // All entries go into the navigation structure: HTML lessons and QTI quizzes per week.
  // Brightspace imports QTI items both as assessments and as content items in the menu.
  const contentEntries = entries;

  const resourcesXml = entries.map((entry) => {
    const fileElements = [`      <file href="${escapeXml(entry.href)}"/>`];
    if (entry.dependencies) {
      for (const dep of entry.dependencies) {
        fileElements.push(`      <file href="${escapeXml(dep)}"/>`);
      }
    }
    return `    <resource identifier="${escapeXml(entry.id)}" type="${
      escapeXml(entry.type)
    }" href="${escapeXml(entry.href)}">
${fileElements.join("\n")}
    </resource>`;
  }).join("\n");

  const itemsXml = buildOrganizationItems(contentEntries);

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="brightspacosaurus_manifest"
  xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1"
  xmlns:lomr="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/resource"
  xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p3/LOM/ccv1p3_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_imscp_v1p2_v1p0.xsd http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest http://www.imsglobal.org/profile/cc/ccv1p3/LOM/ccv1p3_lommanifest_v1p0.xsd">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.3.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string language="nl-NL">${
    escapeXml(courseTitle)
  }</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root">
${itemsXml}
      </item>
    </organization>
  </organizations>
  <resources>
${resourcesXml}
  </resources>
</manifest>
`;
}
