/**
 * Spike for #21: a native Brightspace package (`.zip` with D2L XML) next to the
 * IMS Common Cartridge. The reference exports show what such a package holds:
 * a `description` on each module item (the text and images of a main menu
 * item, which a Common Cartridge import drops), topics as `content` resources
 * with backslash paths, and the course files as plain files. Only that part is
 * built here; quizzes are D2L's own format and are not generated (yet).
 *
 * The format is reverse-engineered from exports, not documented by D2L, so
 * everything here is an experiment to check with a real import.
 *
 * @module
 */

import JSZip from "jszip";
import { basename, dirname, join, relative } from "@std/path";
import * as posix from "@std/path/posix";
import type { NavigationModel } from "./manifest-builder.ts";

/** A topic in a module: a page or a reader PDF. */
export interface NativeTopic {
  title: string;
  /** Path in the package with forward slashes, for example `content/week-1/lesson.html`. */
  href: string;
}

/** A module (a main menu item) with its description and topics. */
export interface NativeModule {
  title: string;
  /** HTML of the module description, may be empty. */
  descriptionHtml: string;
  topics: NativeTopic[];
}

/** Input of {@link buildNativeManifest}. */
export interface NativeManifestInput {
  courseName: string;
  /** Language tag such as `nl-nl`. */
  language: string;
  modules: NativeModule[];
}

const NAMESPACES = [
  'xmlns:d2l_2p0="http://desire2learn.com/xsd/d2lcp_v2p0"',
  'xmlns:scorm_1p2="http://www.adlnet.org/xsd/adlcp_rootv1p2"',
  'xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_rootv1p2p1"',
  'xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"',
].join(" ");

/** Escapes text for use in an XML attribute or element; newlines survive as character references. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, "&#10;");
}

/**
 * The `d2l_2p0` manifest of a native package. Modules and topics get
 * sequential ids, so the output is deterministic. Topic paths use backslashes,
 * as in the reference exports.
 */
export function buildNativeManifest(input: NativeManifestInput): string {
  const lines: string[] = [];
  const resources: string[] = [];
  let id = 1;
  let identifier = 1000;
  const item = (
    title: string,
    material: "contentmodule" | "content",
    href: string,
    description: string,
    indent: string,
  ): string[] => {
    const key = identifier++;
    resources.push(
      `    <resource identifier="RES_CONTENT_${key}" type="webcontent" d2l_2p0:material_type="${material}" d2l_2p0:link_target="" href="${
        escapeXml(href.replaceAll("/", "\\"))
      }" title="" />`,
    );
    return [
      `${indent}<item identifier="${key}" identifierref="RES_CONTENT_${key}" d2l_2p0:id="${id++}" description="${
        escapeXml(description)
      }" completion_type="2" d2l_2p0:ai_human_origin="0">`,
      `${indent}  <title>${escapeXml(title)}</title>`,
    ];
  };
  for (const module of input.modules) {
    lines.push(
      ...item(
        module.title,
        "contentmodule",
        "",
        module.descriptionHtml,
        "      ",
      ),
    );
    for (const topic of module.topics) {
      lines.push(...item(topic.title, "content", topic.href, "", "        "));
      lines.push("        </item>");
    }
    lines.push("      </item>");
  }
  return [
    '﻿<?xml version="1.0" encoding="UTF-8"?>',
    `<manifest identifier="D2L_BSO" ${NAMESPACES}>`,
    "  <metadata>",
    "    <imsmd:lom>",
    "      <imsmd:general>",
    "        <imsmd:title>",
    `          <imsmd:langstring xml:lang="${escapeXml(input.language)}">${
      escapeXml(input.courseName)
    }</imsmd:langstring>`,
    "        </imsmd:title>",
    `        <imsmd:language>${escapeXml(input.language)}</imsmd:language>`,
    "      </imsmd:general>",
    "    </imsmd:lom>",
    "  </metadata>",
    '  <organizations default="d2l_orgs">',
    '    <organization identifier="d2l_org">',
    ...lines,
    "    </organization>",
    "  </organizations>",
    "  <resources>",
    '    <resource identifier="res_courseimage" type="webcontent" d2l_2p0:material_type="d2lcourseimage" d2l_2p0:link_target="" href="courseimage_d2l.xml" title="" />',
    ...resources,
    "  </resources>",
    "</manifest>",
    "",
  ].join("\n");
}

/**
 * The module description from the HTML of its lead page: the inside of
 * `<body>` without scripts and styles, with relative `src` and `href` paths made relative to the root of
 * the course files, because that is where Brightspace looks for them.
 */
export function moduleDescriptionFromHtml(
  html: string,
  leadHref: string,
): string {
  // A description is rich text: no scripts or styles, only the content.
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const directory = posix.dirname(leadHref);
  return body.replace(
    /\b(src|href)="([^"#?]+)([^"]*)"/gi,
    (whole, attribute, path, rest) =>
      /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(path)
        ? whole
        : `${attribute}="${
          posix.normalize(posix.join(directory, path))
        }${rest}"`,
  ).trim();
}

/** Options of {@link packNative}. */
export interface PackNativeOptions {
  /** The build directory, with `content/`, `readers/` and `navigation.json`. */
  buildDir: string;
  outputPath: string;
  courseName: string;
  /** Language tag for the manifest, for example `nl-nl`. */
  language?: string;
}

/** What {@link packNative} did and could not do. */
export interface PackNativeResult {
  modules: number;
  topics: number;
  files: number;
  /** Quizzes in the build that are not part of the package. */
  skippedQuizzes: number;
}

async function collectFiles(
  directory: string,
  root: string,
): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory) found.push(...await collectFiles(path, root));
    else if (entry.isFile) {
      found.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  return found.sort();
}

/**
 * Packs the build output into a native Brightspace package: a manifest with
 * module descriptions, the lesson pages and reader PDFs as topics, and the
 * course files (`content/`, `readers/`). The lead page of a module becomes the
 * module description, not a topic. Quizzes are left out.
 */
export async function packNative(
  options: PackNativeOptions,
): Promise<PackNativeResult> {
  const navigation = JSON.parse(
    await Deno.readTextFile(join(options.buildDir, "navigation.json")),
  ) as NavigationModel;
  const modules: NativeModule[] = [];
  let skippedQuizzes = 0;
  for (const module of navigation.modules) {
    const lead = module.items.find((item) =>
      item.docId !== null && item.docId === module.indexId
    );
    const descriptionHtml = lead
      ? moduleDescriptionFromHtml(
        await Deno.readTextFile(join(options.buildDir, lead.href)),
        lead.href,
      )
      : "";
    const topics: NativeTopic[] = [];
    for (const item of module.items) {
      if (item === lead) continue;
      if (item.kind === "quiz") {
        skippedQuizzes++;
        continue;
      }
      topics.push({ title: item.title, href: item.href });
    }
    modules.push({
      title: module.title,
      descriptionHtml,
      topics,
    });
  }
  const zip = new JSZip();
  const date = new Date("1980-01-01T00:00:00Z");
  const add = (name: string, content: string | Uint8Array) =>
    zip.file(name, content, { createFolders: false, date });
  add(
    "imsmanifest.xml",
    buildNativeManifest({
      courseName: options.courseName,
      language: options.language ?? "nl-nl",
      modules,
    }),
  );
  add(
    "courseimage_d2l.xml",
    '﻿<?xml version="1.0" encoding="utf-8"?>\n<course_appearance>\n\t<course_image>\n\t\t<pictureId />\n\t\t<hasCatalogPic>False</hasCatalogPic>\n\t\t<picLocation></picLocation>\n\t</course_image>\n\t<show_course_banner>True</show_course_banner>\n</course_appearance>\n',
  );
  let files = 0;
  for (const folder of ["content", "readers"]) {
    const root = join(options.buildDir, folder);
    const exists = await Deno.stat(root).then(() => true, () => false);
    if (!exists) continue;
    for (const path of await collectFiles(root, options.buildDir)) {
      add(path, await Deno.readFile(join(options.buildDir, path)));
      files++;
    }
  }
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  await Deno.mkdir(dirname(options.outputPath), { recursive: true });
  await Deno.writeFile(options.outputPath, bytes);
  return {
    modules: modules.length,
    topics: modules.reduce((sum, module) => sum + module.topics.length, 0),
    files,
    skippedQuizzes,
  };
}

/** The file name of a native package: `<name>.v<version>.d2l.zip`. */
export function nativePackageName(name: string, version: string): string {
  return `${basename(name)}.v${version}.d2l.zip`;
}
