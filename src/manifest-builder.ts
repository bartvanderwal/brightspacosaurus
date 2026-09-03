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

function buildOrganizationItems(entries: ManifestEntry[]): string {
  const groupedEntries = new Map<string, ManifestEntry[]>();
  const readerEntries: ManifestEntry[] = [];
  const ungroupedEntries: ManifestEntry[] = [];
  const docentenEntries: ManifestEntry[] = [];

  for (const entry of entries) {
    // Instructor items go into a separate hidden module
    if (entry.href.startsWith("content/docenten/") || entry.href.startsWith("docenten/")) {
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

  const groupItems = [...groupedEntries.entries()].map(([groupLabel, groupEntries]) => {
    const groupId = "group_" + groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const childItems = groupEntries.map((entry) => {
      return `        <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`;
    }).join("\n");

    return `      <item identifier="${escapeXml(groupId)}">
        <title>${escapeXml(groupLabel)}</title>
${childItems}
      </item>`;
  });

  const looseItems = ungroupedEntries.map((entry) => {
    return `      <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
        <title>${escapeXml(entry.title)}</title>
      </item>`;
  });

  // Readers module: all reader PDFs under a single heading
  const readersModule = readerEntries.length > 0
    ? [`      <item identifier="module_readers">
        <title>Readers</title>
${readerEntries.map((entry) => `        <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`).join("\n")}
      </item>`]
    : [];

  // Instructor module: set to "Do not display" after import in Brightspace
  const docentenItems = docentenEntries.length > 0
    ? [`      <item identifier="module_docentenmateriaal">
        <title>Instructor material (hide after import)</title>
${docentenEntries.map((entry) => `        <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`).join("\n")}
      </item>`]
    : [];

  return [...groupItems, ...looseItems, ...readersModule, ...docentenItems].join("\n");
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
export function buildManifest(courseTitle: string, entries: ManifestEntry[]): string {
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
    return `    <resource identifier="${escapeXml(entry.id)}" type="${escapeXml(entry.type)}" href="${escapeXml(entry.href)}">
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
          <lomimscc:string language="nl-NL">${escapeXml(courseTitle)}</lomimscc:string>
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
