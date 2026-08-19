/**
 * Brightspacosaurus CLI — entry point.
 * Subcommando's: prepare, pack
 * Requirements: 6.2, 6.4, 6.5
 */

import { resolve, join, basename, extname, relative, dirname } from "@std/path";
import { scanSources } from "./source-scanner.ts";
import { convertMarkdown } from "./markdown-converter.ts";
import { convertQuiz } from "./quiz-converter.ts";
import { convertReaderToPdf, pandocAvailable } from "./reader-pdf-converter.ts";
import { buildManifest } from "./manifest-builder.ts";
import { pack } from "./packer.ts";
import { ManifestEntry, ResolvedConfig } from "./types.ts";
import {
  findConfigFile,
  loadConfig,
  resolveConfig,
  resolveFromCliOnly,
  EXAMPLE_CONFIG,
} from "./config-loader.ts";

/**
 * Decodeert HTML-entities terug naar platte tekst.
 * Nodig omdat titels uit gegenereerde HTML worden geëxtraheerd (waar rehype al
 * correct heeft geëscapet). Zonder decodering zou escapeXml() in de ManifestBuilder
 * de entities dubbel escapen (bijv. &amp; → &amp;amp;).
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

const USAGE = `Gebruik: brightspacosaurus <commando> [opties]

Commando's:
  prepare   Zet Markdown-bronbestanden om naar HTML en quiz-Markdown naar QTI
  pack      Verpak build-map tot een .imscc-archief

Opties:
  --config <pad>     Pad naar configuratiebestand (standaard: brightspacosaurus.config.json in cwd)
  --sources <map>    Bronmap voor les- en quiz-Markdown (override van config.sourcesDir)
  --output <pad>     Uitvoerpad of naam voor .imscc (override van config.outputDir/name)
  --readers-only     Genereer alleen reader- en docenten-PDF's (skip HTML/QTI-conversie)
`;

function printUsage(): void {
  console.error(USAGE);
}

function parseArgs(args: string[]): { command: string; sources: string; readersOnly: boolean; output: string; config: string } | null {
  if (args.length === 0) return null;

  const command = args[0];
  if (command !== "prepare" && command !== "pack") return null;

  let sources = "";
  let readersOnly = false;
  let output = "";
  let config = "";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--sources" && i + 1 < args.length) {
      sources = args[++i];
    } else if (args[i] === "--readers-only") {
      readersOnly = true;
    } else if (args[i] === "--name" && i + 1 < args.length) {
      output = args[++i]; // backwards compat
    } else if (args[i] === "--output" && i + 1 < args.length) {
      output = args[++i];
    } else if (args[i] === "--config" && i + 1 < args.length) {
      config = args[++i];
    }
  }

  return { command, sources, readersOnly, output, config };
}



async function runPrepare(config: ResolvedConfig, readersOnly: boolean): Promise<void> {
  const repoRoot = config.repoRoot;
  const buildDir = config.outputDir;
  const contentOutputDir = join(buildDir, "content");
  const quizOutputDir = join(buildDir, "quiz");
  const readersOutputDir = join(buildDir, "readers");

  if (!readersOnly) {
    await Deno.remove(contentOutputDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(quizOutputDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(join(buildDir, "imsmanifest.xml")).catch(() => undefined);
  }
  await Deno.remove(readersOutputDir, { recursive: true }).catch(() => undefined);

  console.log(`Scannen van bronmap: ${relative(repoRoot, config.sourcesDir) || config.sourcesDir}`);
  const scanResult = await scanSources({
    sourcesDir: config.sourcesDir,
    repoRoot,
  });

  // Reader-scan vanuit config.readersDir (null → overslaan zonder melding)
  let readerFiles: string[] = [];
  if (config.readersDir) {
    try {
      await Deno.stat(config.readersDir);
      console.log(`Scannen van readers-map: ${relative(repoRoot, config.readersDir)}`);
      const readersScan = await scanSources({
        sourcesDir: config.readersDir,
        repoRoot,
      });
      readerFiles = readersScan.readerFiles;
    } catch {
      // Readers-map bestaat niet — geen readers
    }
  }

  console.log(`Gevonden: ${scanResult.markdownFiles.length} les-bestanden, ${scanResult.quizFiles.length} quiz-bestanden, ${readerFiles.length} reader-bestanden`);

  if (!readersOnly) {
    // Fase 1: Converteer les-Markdown naar HTML
    for (const mdFile of scanResult.markdownFiles) {
      const result = await convertMarkdown({
        sourcePath: mdFile,
        outputDir: contentOutputDir,
        repoRoot,
        version: config.version,
        customCssPath: config.customCss ?? undefined,
      });
      const relPath = relative(contentOutputDir, result.outputPath);
      console.log(`  ✓ ${relPath}`);
    }

    // Fase 1b: Converteer README.md uit sourcesDir-parent naar HTML
    // (als het bestaat, plaats het onder de eerste weekmap voor manifest-groepering)
    const sourcesParent = dirname(config.sourcesDir);
    const readmePath = join(sourcesParent, "README.md");
    try {
      await Deno.stat(readmePath);
      const week1OutputDir = join(contentOutputDir, "week-1");
      await Deno.mkdir(week1OutputDir, { recursive: true });
      const readmeResult = await convertMarkdown({
        sourcePath: readmePath,
        outputDir: week1OutputDir,
        repoRoot,
        version: config.version,
        customCssPath: config.customCss ?? undefined,
      });
      const relReadmePath = relative(contentOutputDir, readmeResult.outputPath);
      console.log(`  ✓ ${relReadmePath} (Studentenhandleiding)`);
    } catch {
      // README niet gevonden — overslaan
    }

    // Fase 2: Converteer quiz-Markdown naar QTI XML
    for (const quizFile of scanResult.quizFiles) {
      const result = await convertQuiz({
        sourcePath: quizFile,
        outputDir: quizOutputDir,
        repoRoot,
        sourcesDir: config.sourcesDir,
      });
      const relPath = relative(quizOutputDir, result.outputPath);
      console.log(`  ✓ quiz/${relPath}`);
    }
  }

  // Fase 3: Converteer reader-Markdown naar PDF via pandoc
  if (readerFiles.length > 0) {
    if (!pandocAvailable()) {
      console.warn(
        "⚠ pandoc niet gevonden — reader-PDF-conversie overgeslagen. Installeer pandoc: https://pandoc.org/installing.html",
      );
    } else {
      console.log(`Converteer ${readerFiles.length} reader(s) naar PDF...`);
      let succeeded = 0;
      let failed = 0;
      const failedFiles: string[] = [];

      for (const readerFile of readerFiles) {
        try {
          const result = await convertReaderToPdf({
            sourcePath: readerFile,
            outputDir: readersOutputDir,
            repoRoot,
          });
          console.log(`  ✓ readers/${result.filename}`);
          succeeded++;
        } catch (e) {
          failed++;
          const relPath = relative(repoRoot, readerFile);
          failedFiles.push(relPath);
          console.error(`  ✗ ${relPath}: ${(e as Error).message}`);
        }
      }

      // Samenvatting
      console.log(
        `Readers: ${succeeded} van ${readerFiles.length} geconverteerd${failed > 0 ? `, ${failed} mislukt` : ""}`,
      );

      if (failed > 0) {
        const error = new Error(
          `Reader-PDF-conversie mislukt voor: ${failedFiles.join(", ")}`,
        ) as Error & { exitCode?: number };
        error.exitCode = 3;
        throw error;
      }
    }
  }

  // Fase 4: Genereer docentenhandleiding als samengestelde PDF (null → overslaan zonder melding)
  if (config.docentenHandleiding && pandocAvailable()) {
    const dhConfig = config.docentenHandleiding;
    const docentenOutputDir = dhConfig.outputDir;
    await Deno.remove(docentenOutputDir, { recursive: true }).catch(() => undefined);

    // Controleer of alle bronbestanden bestaan
    const existingFiles: string[] = [];
    for (const f of dhConfig.inputFiles) {
      try {
        await Deno.stat(f);
        existingFiles.push(f);
      } catch {
        console.warn(`  ⚠ Docentenbestand niet gevonden: ${relative(repoRoot, f)}`);
      }
    }

    if (existingFiles.length > 0) {
      await Deno.mkdir(docentenOutputDir, { recursive: true });
      const outputFile = join(docentenOutputDir, dhConfig.outputName);
      const today = new Date().toISOString().slice(0, 10);
      // Resource-path: directory van het eerste bronbestand
      const resourcePath = dirname(existingFiles[0]);

      console.log(`Genereer docentenhandleiding PDF (${existingFiles.length} bronbestanden)...`);
      // Resolve BSS asset paden locatie-onafhankelijk
      const bssScriptDir = import.meta.dirname ?? dirname(new URL(import.meta.url).pathname);
      const bssAssetsDir = resolve(bssScriptDir, "..", "assets");
      const headerPath = resolve(bssAssetsDir, "reader-header.tex");
      const includeFilterPath = resolve(bssAssetsDir, "include-filter.lua");

      const cmd = new Deno.Command("pandoc", {
        args: [
          ...existingFiles,
          "-o", outputFile,
          `--resource-path=${resourcePath}`,
          "--pdf-engine=xelatex",
          `-V`, "geometry:margin=2.5cm",
          "-V", "lang=nl",
          "-V", "documentclass=report",
          `-V`, `title=Docentenhandleiding ${config.courseName}`,
          "-V", `date=${today}`,
          `--include-in-header=${headerPath}`,
          `--lua-filter=${includeFilterPath}`,
          "--syntax-highlighting=tango",
          "--toc",
          "--toc-depth=2",
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const pandocOutput = await cmd.output();
      if (pandocOutput.success) {
        console.log(`  ✓ ${relative(buildDir, outputFile)}`);
      } else {
        const stderr = new TextDecoder().decode(pandocOutput.stderr);
        console.warn(`  ⚠ Docentenhandleiding-PDF mislukt (niet-blokkerend): ${stderr.slice(0, 200)}`);
        // Niet-blokkerend: docentenhandleiding is optioneel
        await Deno.remove(outputFile).catch(() => undefined);
      }
    }
  }

  // Fase 4b: Brightspacosaurus-handleiding als aparte PDF
  if (pandocAvailable()) {
    const docentenOutputDir = config.docentenHandleiding?.outputDir ?? join(buildDir, "docenten");
    const bssScriptDir = import.meta.dirname ?? dirname(new URL(import.meta.url).pathname);
    const bssDocsDir = resolve(bssScriptDir, "..", "docs");
    const bssAssetsDir = resolve(bssScriptDir, "..", "assets");
    const bssSource = resolve(bssDocsDir, "brightspacosaurus-handleiding.md");
    // Zorg dat docs/images/ bestaat (kopieer assets als nodig)
    const bssImagesDir = join(bssDocsDir, "images");
    try { await Deno.stat(bssImagesDir); } catch {
      await Deno.mkdir(bssImagesDir, { recursive: true });
      for await (const entry of Deno.readDir(bssAssetsDir)) {
        if (entry.isFile && entry.name.endsWith(".png")) {
          await Deno.copyFile(join(bssAssetsDir, entry.name), join(bssImagesDir, entry.name));
        }
      }
    }
    try {
      await Deno.stat(bssSource);
      await Deno.mkdir(docentenOutputDir, { recursive: true });
      const bssOutput = join(docentenOutputDir, "brightspacosaurus-handleiding.pdf");
      console.log("Genereer Brightspacosaurus-handleiding PDF...");
      const includeFilterPath = resolve(bssAssetsDir, "include-filter.lua");
      const bssCmd = new Deno.Command("pandoc", {
        args: [
          bssSource,
          "-o", bssOutput,
          `--resource-path=${bssDocsDir}`,
          "--pdf-engine=xelatex",
          "-V", "geometry:margin=2.5cm",
          "-V", "lang=nl",
          `--include-in-header=${resolve(bssAssetsDir, "reader-header.tex")}`,
          `--lua-filter=${includeFilterPath}`,
          "--syntax-highlighting=tango",
          "--toc",
          "--toc-depth=2",
          `-V`, `date=${new Date().toISOString().slice(0, 10)}`,
        ],
        stdout: "piped",
        stderr: "piped",
      });
      const bssResult = await bssCmd.output();
      if (bssResult.success) {
        console.log(`  ✓ ${relative(buildDir, bssOutput)}`);
      } else {
        const bssStderr = new TextDecoder().decode(bssResult.stderr);
        console.warn(`  ⚠ BSS-handleiding-PDF mislukt (niet-blokkerend):`);
        console.warn(`    ${bssStderr.trim()}`);
        await Deno.remove(bssOutput).catch(() => undefined);
      }
    } catch {
      // BSS-handleiding niet gevonden — overslaan
    }
  }

  console.log(`Prepare voltooid.`);
}

async function runPack(config: ResolvedConfig): Promise<void> {
  const repoRoot = config.repoRoot;
  const buildDir = config.outputDir;
  const outputPath = join(dirname(buildDir), `${config.name}.v${config.version}.imscc`);

  // Eerst prepare uitvoeren als build/content/ niet bestaat
  try {
    await Deno.stat(join(buildDir, "content"));
  } catch {
    console.log("build/brightspace/content/ niet gevonden, voer eerst prepare uit...");
    await runPrepare(config, false);
  }

  // Genereer imsmanifest.xml
  console.log("Genereren van imsmanifest.xml...");
  const entries: ManifestEntry[] = [];
  const contentDir = join(buildDir, "content");

  async function scanHtml(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory) {
        await scanHtml(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".html")) {
        const relPath = "content/" + relative(contentDir, fullPath);
        const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");

        // Zoek afbeeldingsreferenties in de HTML voor manifest-dependencies
        const html = await Deno.readTextFile(fullPath);

        // Gebruik H1 uit de HTML als titel (valt terug op bestandsnaam).
        // decodeHtmlEntities voorkomt dubbele encoding: rehype escapet al naar &amp; etc.,
        // en escapeXml() in buildManifest doet dat opnieuw als we niet eerst decoderen.
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = h1Match ? decodeHtmlEntities(h1Match[1].trim()) : basename(fullPath, extname(fullPath));

        const imgRegex = /src="([^"]+\.(?:png|jpg|jpeg|gif|svg|webp))"/gi;
        const dependencies: string[] = [];
        let imgMatch: RegExpExecArray | null;
        while ((imgMatch = imgRegex.exec(html)) !== null) {
          const imgSrc = imgMatch[1];
          if (!imgSrc.startsWith("http://") && !imgSrc.startsWith("https://")) {
            // Resolve relatief pad ten opzichte van het HTML-bestand
            const htmlDir = dirname(fullPath);
            const imgAbs = resolve(htmlDir, imgSrc);
            const imgRel = "content/" + relative(contentDir, imgAbs);
            dependencies.push(imgRel);
          }
        }

        entries.push({ id, title, href: relPath, type: "webcontent", dependencies });
      }
    }
  }
  await scanHtml(contentDir);

  // Scan QTI/quiz-bestanden in build
  const quizDir = join(buildDir, "quiz");
  try {
    await Deno.stat(quizDir);
    async function scanQuiz(dir: string): Promise<void> {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory) {
          await scanQuiz(fullPath);
        } else if (entry.isFile && entry.name.endsWith(".xml")) {
          const relPath = "quiz/" + relative(quizDir, fullPath);
          const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");
          const title = basename(fullPath, extname(fullPath));
          entries.push({ id, title, href: relPath, type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment" });
        }
      }
    }
    await scanQuiz(quizDir);
  } catch {
    // Geen quizmap
  }

  // Scan PDF-readers in build/brightspace/readers/
  const readersDir = join(buildDir, "readers");
  try {
    await Deno.stat(readersDir);
    for await (const entry of Deno.readDir(readersDir)) {
      if (entry.isFile && entry.name.endsWith(".pdf")) {
        const relPath = "readers/" + entry.name;
        const id = "res_" + relPath.replace(/[^a-z0-9]/gi, "_");
        const title = basename(entry.name, ".pdf");
        entries.push({ id, title, href: relPath, type: "webcontent" });
      }
    }
  } catch {
    // Geen readers-map — PDF-conversie is optioneel
  }

  // Docenten-PDF's worden NIET in de .imscc opgenomen (veiligheidsrisico: antwoorden zichtbaar voor studenten).
  // Ze staan wél als losse bestanden in build/brightspace/docenten/ voor intern gebruik.
  // Er is geen docenten-landingspagina: GitLab is de source of truth voor docentenmateriaal.

  // Sorteer: HTML eerst, dan quiz
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "webcontent" ? -1 : 1;
    return a.href.localeCompare(b.href);
  });

  const manifestXml = buildManifest(config.courseName, entries);
  await Deno.writeTextFile(join(buildDir, "imsmanifest.xml"), manifestXml);
  console.log("  ✓ imsmanifest.xml");

  // Pack
  console.log("Verpakken tot .imscc...");
  await pack({ sourceDir: buildDir, outputPath });
  console.log(`  ✓ ${relative(repoRoot, outputPath)}`);
  console.log("Pack voltooid.");
}

// --- Main ---

async function main(): Promise<void> {
  const parsed = parseArgs(Deno.args);

  if (!parsed) {
    printUsage();
    Deno.exit(1);
  }

  // repoRoot = de map van waaruit deno run wordt aangeroepen (werkmap)
  // Dit maakt brightspacosaurus locatie-onafhankelijk: de tool kan overal staan.
  const repoRoot = Deno.cwd();

  // Configuratie laden via de config-loading flow:
  // findConfigFile → loadConfig → resolveConfig
  // Met fallback naar CLI-only als er geen configbestand is maar wel --sources.
  let resolvedConfig: ResolvedConfig;

  try {
    const configPath = await findConfigFile(
      repoRoot,
      parsed.config || undefined,
    );

    if (configPath) {
      // Config-bestand gevonden: laad, valideer en merge met CLI-overrides
      const config = await loadConfig(configPath);
      resolvedConfig = resolveConfig(
        config,
        {
          sources: parsed.sources || undefined,
          output: parsed.output || undefined,
          readersOnly: parsed.readersOnly,
          config: parsed.config || undefined,
        },
        repoRoot,
      );
    } else if (parsed.sources) {
      // Geen config-bestand, maar wel --sources: fallback naar CLI-only
      resolvedConfig = resolveFromCliOnly(
        {
          sources: parsed.sources,
          output: parsed.output || undefined,
          readersOnly: parsed.readersOnly,
        },
        repoRoot,
      );
    } else {
      // Geen config-bestand en geen --sources: toon foutmelding + voorbeeld
      console.error(
        "Fout: geen brightspacosaurus.config.json gevonden en geen --sources argument.",
      );
      console.error("Maak een configuratiebestand aan. Voorbeeld:\n");
      console.error(EXAMPLE_CONFIG);
      Deno.exit(1);
    }
  } catch (e) {
    const error = e as Error & { exitCode?: number };
    console.error(`Fout: ${error.message}`);
    Deno.exit(error.exitCode ?? 1);
  }

  try {
    if (parsed.command === "prepare") {
      await runPrepare(resolvedConfig, parsed.readersOnly);
    } else if (parsed.command === "pack") {
      await runPack(resolvedConfig);
    }
  } catch (e) {
    const error = e as Error & { exitCode?: number };
    console.error(`Fout: ${error.message}`);
    Deno.exit(error.exitCode ?? 1);
  }
}

main();
