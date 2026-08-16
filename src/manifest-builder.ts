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

function getNiveau(weekNr: number): number | null {
  if (weekNr === 1) return 1;
  if (weekNr >= 2 && weekNr <= 4) return 2;
  if (weekNr >= 5 && weekNr <= 7) return 3;
  if (weekNr === 8) return 4;
  return null;
}

function getWeekLabel(href: string): string | null {
  const match = href.match(/(?:^|\/)week-(\d+)\//);
  if (!match) return null;

  const weekNr = Number(match[1]);
  const niveau = getNiveau(weekNr);
  return niveau ? `Week ${weekNr} — Niveau ${niveau}` : `Week ${weekNr}`;
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

    const weekLabel = getWeekLabel(entry.href);
    if (!weekLabel) {
      ungroupedEntries.push(entry);
      continue;
    }

    const weekEntries = groupedEntries.get(weekLabel) ?? [];
    weekEntries.push(entry);
    groupedEntries.set(weekLabel, weekEntries);
  }

  const weekItems = [...groupedEntries.entries()].map(([weekLabel, weekEntries]) => {
    const weekId = "week_" + weekLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const childItems = weekEntries.map((entry) => {
      return `        <item identifier="item_${escapeXml(entry.id)}" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`;
    }).join("\n");

    return `      <item identifier="${escapeXml(weekId)}">
        <title>${escapeXml(weekLabel)}</title>
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

  return [...weekItems, ...looseItems, ...readersModule, ...docentenItems].join("\n");
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
  // QTI assessments horen niet als organization-items (content modules) in Brightspace.
  // Ze worden alleen als resource opgenomen; Brightspace importeert ze in de Quizzes-tool.
  const contentEntries = entries.filter((e) => e.type === "webcontent");

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
