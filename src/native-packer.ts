/**
 * Spike: a native Brightspace package (`.zip` with D2L XML) next to the
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

/** A topic in a module: a page, a reader PDF or a link to a quiz. */
export interface NativeTopic {
  title: string;
  /** Path in the package with forward slashes, for example `content/week-1/lesson.html`. */
  href: string;
  /** Set for a quiz: the resource code that links the topic to `quiz_d2l_<n>.xml`. */
  quiz?: { number: number; resourceCode: string };
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

/** The file of quiz `number` in the package. */
export function quizFileName(number: number): string {
  return `quiz_d2l_${number}.xml`;
}

/** The link that puts a quiz in a module; Brightspace fills in `{orgUnitId}`. */
export function quizLink(resourceCode: string): string {
  return `/d2l/common/dialogs/quickLink/quickLink.d2l?ou={orgUnitId}&type=quiz&rCode=${resourceCode}`;
}

/** A course code of 24 hex digits, the same for the same course name. */
export async function courseResourceCode(courseName: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(courseName),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("").slice(0, 24);
}

/** The quiz as the package holds it, and the images it uses. */
export interface NativeQuiz {
  xml: string;
  /** Image paths in the build directory, as written in the quiz. */
  images: { path: string; name: string }[];
}

/**
 * The Common Cartridge QTI of a quiz as a native quiz file. Brightspace's own
 * quiz files are QTI 1.2 with `d2l_2p0` attributes; the quiz gets its id and
 * the resource code that the module link points at. The images go to the root
 * of the package under their bare file name, as in the reference exports, and
 * the `src` attributes follow. Two different images with one name are an error.
 */
export function nativeQuizFromQti(
  qti: string,
  quiz: { number: number; resourceCode: string },
): NativeQuiz {
  const images: { path: string; name: string }[] = [];
  const seen = new Map<string, string>();
  const xml = qti
    .replace(
      /<questestinterop\b/,
      '<questestinterop xmlns:d2l_2p0="http://desire2learn.com/xsd/d2lcp_v2p0"',
    )
    .replace(
      /<assessment\b/,
      `<assessment d2l_2p0:id="${quiz.number}" d2l_2p0:resource_code="${quiz.resourceCode}"`,
    )
    .replace(
      /(src=(?:&quot;|"))([^"&\s]+\.(?:svg|png|jpe?g|gif|webp))((?:&quot;|"))/gi,
      (_match, open: string, path: string, close: string) => {
        const name = basename(path);
        const known = seen.get(name);
        if (known !== undefined && known !== path) {
          throw new Error(
            `Quiz image name clash in the native package: ${known} and ${path} are both called ${name}.`,
          );
        }
        if (known === undefined) {
          seen.set(name, path);
          images.push({ path, name });
        }
        return `${open}${name}${close}`;
      },
    );
  return { xml, images };
}

/**
 * The `d2l_2p0` manifest of a native package. Modules and topics get
 * sequential ids, so the output is deterministic. Topic paths use backslashes,
 * as in the reference exports.
 */
export function buildNativeManifest(input: NativeManifestInput): string {
  const lines: string[] = [];
  const resources: string[] = [];
  const quizResources: string[] = [];
  let id = 1;
  let identifier = 1000;
  const item = (
    title: string,
    material: "contentmodule" | "content" | "contentlink",
    href: string,
    description: string,
    indent: string,
    resourceCode?: string,
  ): string[] => {
    const key = identifier++;
    // A link keeps its forward slashes; a file path gets backslashes, as in the exports.
    const target = material === "contentlink"
      ? href
      : href.replaceAll("/", "\\");
    resources.push(
      `    <resource identifier="RES_CONTENT_${key}" type="webcontent" d2l_2p0:material_type="${material}" d2l_2p0:link_target="${
        material === "contentlink" ? "_self" : ""
      }" href="${escapeXml(target)}" title="" />`,
    );
    return [
      `${indent}<item identifier="${key}" identifierref="RES_CONTENT_${key}" d2l_2p0:id="${id++}"${
        resourceCode ? ` d2l_2p0:resource_code="${resourceCode}"` : ""
      } description="${
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
      if (topic.quiz) {
        lines.push(
          ...item(
            topic.title,
            "contentlink",
            quizLink(topic.quiz.resourceCode),
            "",
            "        ",
            // The item of a quiz link has a resource code of its own, as in the reference exports.
            `${topic.quiz.resourceCode.replace(/-\d+$/, "")}-${
              100 + topic.quiz.number
            }`,
          ),
        );
        quizResources.push(
          `    <resource identifier="res_quiz_${topic.quiz.number}" type="webcontent" d2l_2p0:material_type="d2lquiz" d2l_2p0:link_target="" href="${
            quizFileName(topic.quiz.number)
          }" title="${escapeXml(topic.title)}" />`,
        );
      } else {
        lines.push(...item(topic.title, "content", topic.href, "", "        "));
      }
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
    ...quizResources,
    "  </resources>",
    "</manifest>",
    "",
  ].join("\n");
}

/**
 * A link to a file of the course in a module description is shown as plain text: Brightspace
 * shows the description on the page of the module, so a relative link does not find the file
 * (rule D1 of *Module descriptions in the native package*). Links to other sites, to an anchor
 * and to an address from the root stay. Returns the HTML and how many links were taken out.
 */
export function withoutCourseFileLinks(
  html: string,
): { html: string; removed: number } {
  let removed = 0;
  const result = html.replace(
    /<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (whole, href: string, text: string) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/|#|$)/i.test(href)) return whole;
      removed++;
      return text;
    },
  );
  return { html: result, removed };
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
  return moduleDescription(html, leadHref).html;
}

/** {@link moduleDescriptionFromHtml}, with the number of links to files that were taken out. */
export function moduleDescription(
  html: string,
  leadHref: string,
): { html: string; linksRemoved: number } {
  // A description is rich text: no scripts or styles, only the content.
  const stripped = withoutCourseFileLinks(
    (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ""),
  );
  const directory = posix.dirname(leadHref);
  const rooted = stripped.html.replace(
    /\b(src|href)="([^"#?]+)([^"]*)"/gi,
    (whole, attribute, path, rest) =>
      /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(path)
        ? whole
        : `${attribute}="${
          posix.normalize(posix.join(directory, path))
        }${rest}"`,
  ).trim();
  return { html: rooted, linksRemoved: stripped.removed };
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
  /** Quizzes in the package, as `quiz_d2l_<n>.xml` files linked from their module. */
  quizzes: number;
  /** Per module: links to files that were taken out of its description (they do not work there). */
  descriptionLinks: { module: string; removed: number }[];
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
 * module description, not a topic. Every quiz becomes a `quiz_d2l_<n>.xml` file and a
 * link topic in its module; the images of the quizzes go to the package root.
 */
export async function packNative(
  options: PackNativeOptions,
): Promise<PackNativeResult> {
  const navigation = JSON.parse(
    await Deno.readTextFile(join(options.buildDir, "navigation.json")),
  ) as NavigationModel;
  const modules: NativeModule[] = [];
  const descriptionLinks: { module: string; removed: number }[] = [];
  const resourceCode = await courseResourceCode(options.courseName);
  const quizFiles: { name: string; xml: string }[] = [];
  const quizImages = new Map<string, string>();
  for (const module of navigation.modules) {
    const lead = module.items.find((item) =>
      item.docId !== null && item.docId === module.indexId
    );
    const description = lead
      ? moduleDescription(
        await Deno.readTextFile(join(options.buildDir, lead.href)),
        lead.href,
      )
      : { html: "", linksRemoved: 0 };
    const descriptionHtml = description.html;
    if (description.linksRemoved) {
      descriptionLinks.push({
        module: module.title,
        removed: description.linksRemoved,
      });
    }
    const topics: NativeTopic[] = [];
    for (const item of module.items) {
      if (item === lead) continue;
      if (item.kind === "quiz") {
        const number = quizFiles.length + 1;
        const quiz = nativeQuizFromQti(
          await Deno.readTextFile(join(options.buildDir, item.href)),
          { number, resourceCode: `${resourceCode}-${number}` },
        );
        for (const image of quiz.images) {
          const known = quizImages.get(image.name);
          if (known !== undefined && known !== image.path) {
            throw new Error(
              `Quiz image name clash in the native package: ${known} and ${image.path} are both called ${image.name}.`,
            );
          }
          quizImages.set(image.name, image.path);
        }
        quizFiles.push({ name: quizFileName(number), xml: quiz.xml });
        topics.push({
          title: item.title,
          href: quizFileName(number),
          quiz: { number, resourceCode: `${resourceCode}-${number}` },
        });
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
  for (const quiz of quizFiles) add(quiz.name, quiz.xml);
  for (const [name, path] of [...quizImages].sort()) {
    add(name, await Deno.readFile(join(options.buildDir, path)));
  }
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
    quizzes: quizFiles.length,
    descriptionLinks,
  };
}

/** The file name of a native package: `<name>.v<version>.d2l.zip`. */
export function nativePackageName(name: string, version: string): string {
  return `${basename(name)}.v${version}.d2l.zip`;
}
