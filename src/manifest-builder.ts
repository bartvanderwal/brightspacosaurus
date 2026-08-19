/**
 * ManifestBuilder: genereert een geldig imsmanifest.xml voor Common Cartridge 1.3.
 * Requirements: 2.1, 2.3
 */

import { ManifestEntry } from "./types.ts";

/**
 * Escapet XML-speciale tekens in een string.
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
 * Extraheert een groepslabel op basis van de eerste submap in het href-pad.
 * Bijv. "content/week-1/les.html" → "week-1", "content/module-a/intro.html" → "module-a".
 * Bestanden zonder submap (bijv. "content/index.html") retourneren null.
 *
 * De groepering is generiek: er wordt geen cursusspecifieke mapping (zoals week→niveau) toegepast.
 */
function getGroupLabel(href: string): string | null {
  // Strip het eerste "content/" of "quiz/" prefix indien aanwezig
  const stripped = href.replace(/^(?:content|quiz)\//, "");
  // Zoek de eerste submap (alles vóór de eerste '/' in het gestripte pad)
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
    // Docenten-items komen in een aparte verborgen module
    if (entry.href.startsWith("content/docenten/") || entry.href.startsWith("docenten/")) {
      docentenEntries.push(entry);
      continue;
    }

    // Reader-PDF's komen onder één "Readers"-module
    if (entry.href.startsWith("readers/")) {
      readerEntries.push(entry);
      continue;
    }

    // Groepeer op basis van de eerste submap (bijv. "week-1", "module-a", "sad")
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

  // Readers-module: alle reader-PDF's onder één kopje
  const readersModule = readerEntries.length > 0
    ? [`      <item identifier="module_readers">
        <title>Readers</title>
${readerEntries.map((entry) => `        <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`).join("\n")}
      </item>`]
    : [];

  // Docenten-module: na import in Brightspace op "Niet weergeven" zetten
  const docentenItems = docentenEntries.length > 0
    ? [`      <item identifier="module_docentenmateriaal">
        <title>Docentenmateriaal (verberg na import)</title>
${docentenEntries.map((entry) => `        <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`).join("\n")}
      </item>`]
    : [];

  return [...groupItems, ...looseItems, ...readersModule, ...docentenItems].join("\n");
}

/**
 * Genereert een geldig imsmanifest.xml op basis van de cursustitel en resource-entries.
 *
 * Deterministische volgorde: entries worden opgenomen in de volgorde waarin ze worden aangeleverd.
 * De aanroeper sorteert: HTML-bestanden op pad, QTI-bestanden daarna.
 *
 * @param courseTitle - Mensleesbare cursustitel
 * @param entries - Resource-entries (HTML webcontent + QTI assessments)
 * @returns Volledige XML-string van het manifest
 */
export function buildManifest(courseTitle: string, entries: ManifestEntry[]): string {
  // Alle entries komen in de navigatiestructuur: HTML-lessen én QTI-quizzen per week.
  // Brightspace importeert QTI-items als assessments én als content-items in het menu.
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
