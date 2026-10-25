/**
 * Builds IMS Common Cartridge manifests for Brightspace imports.
 *
 * The manifest includes content, quiz and reader resources and defines the
 * deterministic Brightspace navigation order.
 *
 * @module
 */

import type { ManifestEntry, ReadersModuleConfig } from "./types.ts";
import { isNavigationExcludedFile } from "./navigation-exclusions.ts";

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

/** Derives a human-readable Brightspace menu title from a reader PDF filename. */
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
  const code = getNavigationCode(entry);
  return code
    ? code.split(/[.-]/).map((part) => Number(part)).filter(Number.isFinite)
    : null;
}

function getNavigationCode(entry: ManifestEntry): string | null {
  const candidates = [
    entry.title,
    getFileStem(entry.href).replace(/^qti-/, ""),
  ];

  for (const candidate of candidates) {
    const matches = candidate.match(/\d+(?:[.-]\d+)*/g) ?? [];
    const specific = matches.find((match) => /[.-]/.test(match));
    const selected = specific ?? matches[0];
    if (!selected) continue;
    return selected.replace(/-/g, ".");
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

/** Options for the navigation order. */
export interface NavigationOptions {
  /** Href of a page that always comes first in its module (the teacher page). */
  firstHref?: string;
}

/** Docusaurus order: pages with a `sidebar_position` first, ascending. */
function comparePositions(a: ManifestEntry, b: ManifestEntry): number {
  if (a.position === undefined && b.position === undefined) return 0;
  if (a.position === undefined) return 1;
  if (b.position === undefined) return -1;
  return a.position - b.position;
}

/** The listed files of an overview come first, in list order. */
function compareListed(a: ManifestEntry, b: ManifestEntry): number {
  if (a.order === undefined && b.order === undefined) return 0;
  if (a.order === undefined) return 1;
  if (b.order === undefined) return -1;
  return a.order - b.order;
}

/**
 * Sorts manifest entries into the navigation order of Brightspace and the
 * preview. Per module: the teacher page, the lead page, the files of the
 * overview list in list order, the files with a `sidebar_position`, and then
 * the rest in the natural order of the file name. BSO reads no order from
 * numbers in titles (see the Software Guidebook, *Menu order*).
 */
export function sortManifestEntriesForNavigation(
  entries: ManifestEntry[],
  options: NavigationOptions = {},
): ManifestEntry[] {
  return [...entries].sort((a, b) => {
    const groupCompare = naturalCompare(
      getGroupLabel(a.href) ?? "",
      getGroupLabel(b.href) ?? "",
    );
    if (groupCompare !== 0) return groupCompare;

    if (
      options.firstHref &&
      (a.href === options.firstHref) !== (b.href === options.firstHref)
    ) {
      return a.href === options.firstHref ? -1 : 1;
    }

    const moduleLeadCompare = moduleLeadPageWeight(a) - moduleLeadPageWeight(b);
    if (moduleLeadCompare !== 0) return moduleLeadCompare;

    const listedCompare = compareListed(a, b);
    if (listedCompare !== 0) return listedCompare;

    const positionCompare = comparePositions(a, b);
    if (positionCompare !== 0) return positionCompare;

    const nameCompare = naturalCompare(
      a.sortName ?? getFileStem(a.href),
      b.sortName ?? getFileStem(b.href),
    );
    if (nameCompare !== 0) return nameCompare;

    const titleCompare = naturalCompare(a.title, b.title);
    if (titleCompare !== 0) return titleCompare;

    return naturalCompare(a.href, b.href);
  });
}

/**
 * The order that BSO derived before the menu order was specified: lesson codes
 * read from titles and file names, quizzes after lessons. Kept only to tell a
 * course that still relies on it what changed.
 */
function legacyNavigationOrder(entries: ManifestEntry[]): ManifestEntry[] {
  return [...entries].sort((a, b) => {
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

/** A module whose order only followed from the old derivation. */
export interface ImplicitOrderProblem {
  module: string;
  /** Hrefs in the order BSO used to give them, and in the order they have now. */
  before: string[];
  after: string[];
}

/**
 * The modules whose files have neither an overview list nor a `sidebar_position`
 * and whose old derived order differs from the natural order: for those the
 * order changes, and BSO says so instead of reordering silently.
 */
export function implicitOrderProblems(
  entries: ManifestEntry[],
  options: NavigationOptions = {},
): ImplicitOrderProblem[] {
  const modules = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    if (entry.hidden || entry.href.startsWith("readers/")) continue;
    if (
      entry.order !== undefined || entry.position !== undefined ||
      moduleLeadPageWeight(entry) === 0 || entry.href === options.firstHref
    ) continue;
    const module = getGroupLabel(entry.href) ?? "";
    modules.set(module, [...(modules.get(module) ?? []), entry]);
  }
  const problems: ImplicitOrderProblem[] = [];
  for (const [module, moduleEntries] of modules) {
    const natural = sortManifestEntriesForNavigation(moduleEntries, options)
      .map((entry) => entry.href);
    const legacy = legacyNavigationOrder(moduleEntries).map((entry) =>
      entry.href
    );
    if (natural.join("\n") !== legacy.join("\n")) {
      problems.push({ module, before: legacy, after: natural });
    }
  }
  return problems.sort((a, b) => naturalCompare(a.module, b.module));
}

/**
 * Module title: the author-written title of its lead page, otherwise the folder name.
 */
function moduleTitle(
  groupLabel: string,
  groupEntries: ManifestEntry[],
): string {
  const leadPage = groupEntries.find((entry) =>
    entry.type === "webcontent" && moduleLeadPageWeight(entry) === 0
  );
  return leadPage?.title ?? groupLabel;
}

export interface NavigationItem {
  kind: "lesson" | "quiz" | "reader";
  docId: string | null;
  href: string;
  title: string;
  code: string | null;
  position: number | null;
}

export interface NavigationModule {
  id: string;
  title: string;
  indexId: string | null;
  items: NavigationItem[];
}

export interface NavigationModel {
  version: 1;
  modules: NavigationModule[];
}

export interface NavigationModelOptions {
  readersModule?: ReadersModuleConfig;
  docIdForEntry?: (entry: ManifestEntry) => string | null;
}

function isNavigationExcluded(entry: ManifestEntry): boolean {
  return isNavigationExcludedFile(entry.href);
}

function navigationGroupId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Creates the format-neutral navigation model from already-sorted manifest entries. */
export function buildNavigationModel(
  sortedEntries: ManifestEntry[],
  options: NavigationModelOptions = {},
): NavigationModel {
  const readersModule = options.readersModule ??
    { slug: "readers", title: null };
  const groups = new Map<string, ManifestEntry[]>();
  const readerEntries: ManifestEntry[] = [];

  for (const entry of sortedEntries) {
    if (
      // A hidden entry only carries files (the images of a quiz): no menu item.
      entry.hidden || isNavigationExcluded(entry) ||
      entry.href.startsWith("content/docenten/") ||
      entry.href.startsWith("docenten/")
    ) continue;
    if (entry.href.startsWith("readers/")) {
      readerEntries.push(entry);
      continue;
    }
    const label = getGroupLabel(entry.href) ?? "";
    const groupEntries = groups.get(label) ?? [];
    groupEntries.push(entry);
    groups.set(label, groupEntries);
  }

  const hasContentReaderGroup = groups.has(readersModule.slug);
  const readerGroup = groups.get(readersModule.slug);
  if (readerGroup) {
    readerGroup.push(...readerEntries);
  } else if (readerEntries.length) {
    groups.set(readersModule.slug, readerEntries);
  }

  const orderedGroups = [...groups.entries()];
  const modules = orderedGroups
    .filter(([label]) =>
      label !== "" && (hasContentReaderGroup || label !== readersModule.slug)
    )
    .sort(([a], [b]) => naturalCompare(a, b))
    .concat(orderedGroups.filter(([label]) => label === ""))
    .concat(
      hasContentReaderGroup
        ? []
        : orderedGroups.filter(([label]) => label === readersModule.slug),
    )
    .map(([groupLabel, entries]) => {
      const holdsReaders = groupLabel === readersModule.slug;
      const isSeparateReadersModule = holdsReaders && !hasContentReaderGroup;
      const items = entries.map((entry): NavigationItem => {
        const isReader = entry.href.startsWith("readers/");
        return {
          kind: isReader
            ? "reader"
            : entry.type === "imsqti_xmlv1p2/imscc_xmlv1p3/assessment"
            ? "quiz"
            : "lesson",
          docId: isReader
            ? null
            : options.docIdForEntry
            ? options.docIdForEntry(entry)
            : entry.href.replace(/^(?:content|quiz)\//, "").replace(
              /\.[^.]+$/,
              "",
            ),
          href: entry.href,
          title: entry.title,
          code: moduleLeadPageWeight(entry) === 0
            ? null
            : getNavigationCode(entry),
          position: entry.position ?? null,
        };
      });
      const leadPage = entries.find((entry) =>
        entry.type === "webcontent" && moduleLeadPageWeight(entry) === 0
      );
      const title = holdsReaders && readersModule.title
        ? readersModule.title
        : isSeparateReadersModule
        ? "Readers"
        : groupLabel === ""
        ? moduleTitle("Algemeen", entries)
        : moduleTitle(groupLabel, entries);
      return {
        id: groupLabel ? navigationGroupId(groupLabel) : "general",
        title,
        indexId: leadPage
          ? (options.docIdForEntry
            ? options.docIdForEntry(leadPage)
            : leadPage.href.replace(/^(?:content|quiz)\//, "").replace(
              /\.[^.]+$/,
              "",
            ))
          : null,
        items,
      };
    });
  return { version: 1, modules };
}

/** Converts the shared model to the Docusaurus SidebarsConfig shape. */
export function buildDocusaurusSidebars(
  navigation: NavigationModel,
): Record<string, unknown> {
  const docs = navigation.modules.flatMap((module) => {
    const items = module.items
      .filter((item) => item.kind !== "reader" && item.docId !== null)
      .map((item) => item.docId!);
    if (!items.length) return [];
    return [{
      type: "category",
      label: module.title,
      ...(module.indexId ? { link: { type: "doc", id: module.indexId } } : {}),
      items,
    }];
  });
  return { docs };
}

function itemXml(entry: ManifestEntry): string {
  return `        <item identifier="item_${
    escapeXml(entry.id)
  }" identifierref="${escapeXml(entry.id)}">
          <title>${escapeXml(entry.title)}</title>
        </item>`;
}

/** Where the Voortgangsverkenner goes in the menu (see `teacherDashboard.module`). */
export interface DashboardPlacement {
  /** Content module that holds the dashboard; null keeps the separate instructor module. */
  module: ReadersModuleConfig | null;
  /** Manifest href of the teacher page; the dashboard comes directly after it. */
  teacherPageHref?: string;
}

function buildOrganizationItems(
  entries: ManifestEntry[],
  navigation: NavigationModel,
  readersModule: ReadersModuleConfig,
  dashboard: DashboardPlacement = { module: null },
): string {
  const entriesByHref = new Map(entries.map((entry) => [entry.href, entry]));
  const instructorEntries = entries.filter((entry) =>
    entry.href.startsWith("content/docenten/") ||
    entry.href.startsWith("docenten/")
  );
  const dashboardModuleId = dashboard.module
    ? navigationGroupId(dashboard.module.slug)
    : null;
  const dashboardModuleExists = navigation.modules.some((module) =>
    module.id === dashboardModuleId
  );
  const moduleItems = navigation.modules.map((module) => {
    const pages = module.items.flatMap((item) => {
      const entry = entriesByHref.get(item.href);
      return entry ? [entry] : [];
    });
    const holdsDashboard = module.id === dashboardModuleId;
    const children = [...pages];
    if (holdsDashboard && instructorEntries.length) {
      const at = pages.findIndex((entry) =>
        entry.href === dashboard.teacherPageHref
      );
      children.splice(at + 1, 0, ...instructorEntries);
    }
    const isReadersModule =
      module.id === navigationGroupId(readersModule.slug) &&
      module.items.length > 0 &&
      module.items.every((item) => item.kind === "reader");
    const identifier = isReadersModule
      ? `module_${readersModule.slug.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
      : `group_${module.id.replace(/-/g, "_")}`;
    const title = holdsDashboard && dashboard.module?.title
      ? dashboard.module.title
      : module.title;
    return `      <item identifier="${escapeXml(identifier)}">
        <title>${escapeXml(title)}</title>
${children.map(itemXml).join("\n")}
      </item>`;
  });

  if (instructorEntries.length && !dashboardModuleExists) {
    const identifier = dashboard.module
      ? "module_dashboard_" +
        dashboard.module.slug.toLowerCase().replace(/[^a-z0-9]+/g, "_")
      : "module_docentenmateriaal";
    const title = dashboard.module
      ? dashboard.module.title ?? dashboard.module.slug
      : "Instructor material (hide after import)";
    moduleItems.push(`      <item identifier="${escapeXml(identifier)}">
        <title>${escapeXml(title)}</title>
${instructorEntries.map(itemXml).join("\n")}
      </item>`);
  }

  return moduleItems.join("\n");
}

/** Build details written to the manifest, so a package shows how it was made (issue #56). */
export interface BuildInfo {
  bsoVersion: string;
  courseName: string;
  courseVersion: string;
  /** ISO 8601 build time; omitted by default to keep builds reproducible. */
  buildTime?: string;
}

/**
 * Build time as ISO 8601 from `SOURCE_DATE_EPOCH` (seconds), or `undefined`
 * when unset or invalid. Without it no time is written, so repeated builds of
 * the same input give identical output.
 */
export function buildTimeFromEnv(
  epoch: string | undefined = Deno.env.get("SOURCE_DATE_EPOCH"),
): string | undefined {
  if (!epoch || !/^\d+$/.test(epoch)) return undefined;
  return new Date(Number(epoch) * 1000).toISOString();
}

/** One-line description in `key: value` form, readable with `unzip -p pkg.imscc imsmanifest.xml`. */
export function formatBuildInfo(info: BuildInfo): string {
  return [
    `Brightspacosaurus ${info.bsoVersion}`,
    `course: ${info.courseName}`,
    `course version: ${info.courseVersion}`,
    ...(info.buildTime ? [`built: ${info.buildTime}`] : []),
  ].join("; ");
}

/**
 * Generates a valid imsmanifest.xml based on the course title and resource entries.
 *
 * Deterministic order: entries are included in the order in which they are supplied.
 * The caller sorts: HTML files by path, QTI files after them.
 *
 * @param courseTitle - Human-readable course title
 * @param entries - Resource entries (HTML web content + QTI assessments)
 * @param readersModule - Menu module for reader PDFs (default: separate "Readers")
 * @param dashboard - Menu placement of the Voortgangsverkenner (default: separate instructor module)
 * @param buildInfo - BSO version, course version and optional build time, written as the LOM description
 * @returns Complete XML string of the manifest
 */
export function buildManifest(
  courseTitle: string,
  entries: ManifestEntry[],
  readersModule: ReadersModuleConfig = { slug: "readers", title: null },
  dashboard: DashboardPlacement = { module: null },
  buildInfo?: BuildInfo,
  navigation?: NavigationModel,
): string {
  // Brightspace imports QTI items both as assessments and as menu items.
  // Entries marked hidden (the web content resource that carries quiz images)
  // stay in the resources but not in the menu.
  const contentEntries = entries.filter((entry) => !entry.hidden);

  const resourcesXml = entries.map((entry) => {
    const fileElements = [`      <file href="${escapeXml(entry.href)}"/>`];
    if (entry.dependencies) {
      for (const dep of entry.dependencies) {
        fileElements.push(`      <file href="${escapeXml(dep)}"/>`);
      }
    }
    const dependencyElements = (entry.resourceDependencies ?? []).map((id) =>
      `      <dependency identifierref="${escapeXml(id)}"/>`
    );
    return `    <resource identifier="${escapeXml(entry.id)}" type="${
      escapeXml(entry.type)
    }" href="${escapeXml(entry.href)}">
${[...fileElements, ...dependencyElements].join("\n")}
    </resource>`;
  }).join("\n");

  // Entries arrive in navigation order (sortManifestEntriesForNavigation); the
  // caller decides the order, so it is not sorted again here.
  const sharedNavigation = navigation ??
    buildNavigationModel(entries, { readersModule });
  const itemsXml = buildOrganizationItems(
    contentEntries,
    sharedNavigation,
    readersModule,
    dashboard,
  );

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
        </lomimscc:title>${
    buildInfo
      ? `
        <lomimscc:description>
          <lomimscc:string language="en">${
        escapeXml(formatBuildInfo(buildInfo))
      }</lomimscc:string>
        </lomimscc:description>`
      : ""
  }
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
