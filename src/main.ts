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
import { ManifestEntry } from "./types.ts";

const DEFAULT_SOURCES = "6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/Lesbeschrijvingen/";
const DEFAULT_READERS = "6.3.Studentenmateriaal/6.3.2.Readers/";

const USAGE = `Gebruik: brightspacosaurus <commando> [opties]

Commando's:
  prepare   Zet Markdown-bronbestanden om naar HTML en quiz-Markdown naar QTI in build/brightspace/
  pack      Verpak build/brightspace/ tot een .imscc-archief

Opties:
  --sources <map>    Bronmap voor les- en quiz-Markdown (standaard: ${DEFAULT_SOURCES})
  --output <pad>     Uitvoerpad of naam voor .imscc; bepaalt ook de tussentijdse build-map
                     (standaard: uit .brightspacosaurus.json of package.json name)
                     Pad-voorbeeld: oose-dt/build/OOSE-DT-SAD → .imscc in oose-dt/build/,
                     tussentijdse HTML in oose-dt/build/brightspace/
  --readers-only     Genereer alleen reader- en docenten-PDF's (skip HTML/QTI-conversie)
`;

function printUsage(): void {
  console.error(USAGE);
}

function parseArgs(args: string[]): { command: string; sources: string; readersOnly: boolean; output: string } | null {
  if (args.length === 0) return null;

  const command = args[0];
  if (command !== "prepare" && command !== "pack") return null;

  let sources = DEFAULT_SOURCES;
  let readersOnly = false;
  let output = "";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--sources" && i + 1 < args.length) {
      sources = args[++i];
    } else if (args[i] === "--readers-only") {
      readersOnly = true;
    } else if (args[i] === "--name" && i + 1 < args.length) {
      output = args[++i]; // backwards compat
    } else if (args[i] === "--output" && i + 1 < args.length) {
      output = args[++i];
    }
  }

  return { command, sources, readersOnly, output };
}

/**
 * Leidt de tussentijdse build-map af van het --output pad.
 * Conventie:
 * - output bevat een slash (pad): buildDir = parent(output)/brightspace
 * - output is een bare naam of leeg: buildDir = <repoRoot>/build/brightspace
 *
 * Voorbeelden:
 *   "oose-dt/build/OOSE-DT-SAD" → <repoRoot>/oose-dt/build/brightspace
 *   "OOSE-DT-SAD"               → <repoRoot>/build/brightspace
 *   ""                          → <repoRoot>/build/brightspace
 */
function resolveBuildDir(repoRoot: string, output: string): string {
  const withoutExt = output.endsWith(".imscc") ? output.slice(0, -6) : output;
  // Pad-detectie: bevat slash of is absoluut
  if (withoutExt && (withoutExt.includes("/") || withoutExt.startsWith("/"))) {
    const absOutput = withoutExt.startsWith("/") ? withoutExt : join(repoRoot, withoutExt);
    return join(dirname(absOutput), "brightspace");
  }
  return join(repoRoot, "build", "brightspace");
}

async function runPrepare(repoRoot: string, sourcesDir: string, readersOnly = false, output = ""): Promise<void> {
  const buildDir = resolveBuildDir(repoRoot, output);
  const outputDir = join(buildDir, "content");
  const quizOutputDir = join(buildDir, "quiz");
  const readersOutputDir = join(buildDir, "readers");

  if (!readersOnly) {
    await Deno.remove(outputDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(quizOutputDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(join(buildDir, "imsmanifest.xml")).catch(() => undefined);
  }
  await Deno.remove(readersOutputDir, { recursive: true }).catch(() => undefined);

  console.log(`Scannen van bronmap: ${sourcesDir}`);
  const scanResult = await scanSources({
    sourcesDir: resolve(repoRoot, sourcesDir),
    repoRoot,
  });

  // Aparte scan voor readers in 6.3.2.Readers/
  const readersSourceDir = resolve(repoRoot, DEFAULT_READERS);
  let readerFiles: string[] = [];
  try {
    await Deno.stat(readersSourceDir);
    console.log(`Scannen van readers-map: ${DEFAULT_READERS}`);
    const readersScan = await scanSources({
      sourcesDir: readersSourceDir,
      repoRoot,
    });
    readerFiles = readersScan.readerFiles;
  } catch {
    // Readers-map bestaat niet — geen readers
  }

  console.log(`Gevonden: ${scanResult.markdownFiles.length} les-bestanden, ${scanResult.quizFiles.length} quiz-bestanden, ${readerFiles.length} reader-bestanden`);

  if (!readersOnly) {
    // Fase 1: Converteer les-Markdown naar HTML
    for (const mdFile of scanResult.markdownFiles) {
      const result = await convertMarkdown({
        sourcePath: mdFile,
        outputDir,
        repoRoot,
      });
      const relPath = relative(outputDir, result.outputPath);
      console.log(`  ✓ ${relPath}`);
    }

    // Fase 1b: Converteer Studentenhandleiding README naar HTML en plaats onder week-1
    // zodat de manifest-builder hem automatisch onder Week 1 groepeert.
    const readmePath = resolve(repoRoot, "6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/README.md");
    try {
      await Deno.stat(readmePath);
      const week1OutputDir = join(outputDir, "week-1");
      await Deno.mkdir(week1OutputDir, { recursive: true });
      const readmeResult = await convertMarkdown({
        sourcePath: readmePath,
        outputDir: week1OutputDir,
        repoRoot,
      });
      const relReadmePath = relative(outputDir, readmeResult.outputPath);
      console.log(`  ✓ ${relReadmePath} (Studentenhandleiding)`);
    } catch {
      console.warn("⚠ Studentenhandleiding README.md niet gevonden — overgeslagen.");
    }

    // Fase 2: Converteer quiz-Markdown naar QTI XML
    for (const quizFile of scanResult.quizFiles) {
      const result = await convertQuiz({
        sourcePath: quizFile,
        outputDir: quizOutputDir,
        repoRoot,
        sourcesDir: resolve(repoRoot, sourcesDir),
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

  // Fase 4: Genereer docentenhandleiding als samengestelde PDF
  const docentenOutputDir = join(buildDir, "docenten");
  await Deno.remove(docentenOutputDir, { recursive: true }).catch(() => undefined);
  if (pandocAvailable()) {
    const handleidingDir = resolve(repoRoot, "6.1.Docentenhandleiding");
    const inputFiles = [
      join(handleidingDir, "docentenhandleiding.md"),
      join(handleidingDir, "6.1.1.OWE beschrijving voor in OS-OER", "owebeschrijving.md"),
      join(handleidingDir, "6.1.2.Overzicht van de OWE", "beroepstaak.md"),
      join(handleidingDir, "6.1.3.Cursusopbouw", "cursusopbouw.md"),
      join(handleidingDir, "6.1.3.Cursusopbouw", "componenten-overzicht.md"),
      join(handleidingDir, "adr014-onderhoud-branches-opdrachtrepos.md"),
    ];

    // Controleer of alle bronbestanden bestaan
    const existingFiles: string[] = [];
    for (const f of inputFiles) {
      try {
        await Deno.stat(f);
        existingFiles.push(f);
      } catch {
        console.warn(`  ⚠ Docentenbestand niet gevonden: ${relative(repoRoot, f)}`);
      }
    }

    if (existingFiles.length > 0) {
      await Deno.mkdir(docentenOutputDir, { recursive: true });
      const outputFile = join(docentenOutputDir, "docentenhandleiding-fusten.pdf");
      const today = new Date().toISOString().slice(0, 10);

      console.log(`Genereer docentenhandleiding PDF (${existingFiles.length} bronbestanden)...`);
      const headerPath = resolve(repoRoot, "scripts/brightspacosaurus/assets/reader-header.tex");
      const includeFilterPath = resolve(repoRoot, "scripts/brightspacosaurus/assets/include-filter.lua");
      const cmd = new Deno.Command("pandoc", {
        args: [
          ...existingFiles,
          "-o", outputFile,
          `--resource-path=${handleidingDir}`,
          "--pdf-engine=xelatex",
          `-V`, "geometry:margin=2.5cm",
          "-V", "lang=nl",
          "-V", "documentclass=report",
          `-V`, `title=Docentenhandleiding OWE-1: Full Stack Engineering`,
          "-V", `subtitle=Projectgroep Software \\& Robotics`,
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

      const output = await cmd.output();
      if (output.success) {
        console.log(`  ✓ docenten/docentenhandleiding-fusten.pdf`);
      } else {
        const stderr = new TextDecoder().decode(output.stderr);
        console.warn(`  ⚠ Docentenhandleiding-PDF mislukt (niet-blokkerend): ${stderr.slice(0, 200)}`);
        // Niet-blokkerend: docentenhandleiding is optioneel
        await Deno.remove(outputFile).catch(() => undefined);
      }
    }

    // Fase 4b: Brightspacosaurus-handleiding als aparte PDF
    {
      const bssDocsDir = resolve(repoRoot, "scripts/brightspacosaurus/docs");
      const bssSource = resolve(bssDocsDir, "brightspacosaurus-handleiding.md");
      // Zorg dat docs/images/ bestaat (kopieer assets als nodig)
      const bssImagesDir = join(bssDocsDir, "images");
      try { await Deno.stat(bssImagesDir); } catch {
        await Deno.mkdir(bssImagesDir, { recursive: true });
        const assetsDir = resolve(repoRoot, "scripts/brightspacosaurus/assets");
        for await (const entry of Deno.readDir(assetsDir)) {
          if (entry.isFile && entry.name.endsWith(".png")) {
            await Deno.copyFile(join(assetsDir, entry.name), join(bssImagesDir, entry.name));
          }
        }
      }
    try {
      await Deno.stat(bssSource);
      const bssOutput = join(docentenOutputDir, "brightspacosaurus-handleiding.pdf");
      console.log("Genereer Brightspacosaurus-handleiding PDF...");
      const includeFilterPath = resolve(repoRoot, "scripts/brightspacosaurus/assets/include-filter.lua");
      const bssCmd = new Deno.Command("pandoc", {
        args: [
          bssSource,
          "-o", bssOutput,
          `--resource-path=${bssDocsDir}`,
          "--pdf-engine=xelatex",
          "-V", "geometry:margin=2.5cm",
          "-V", "lang=nl",
          `--include-in-header=${resolve(repoRoot, "scripts/brightspacosaurus/assets/reader-header.tex")}`,
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
        console.log(`  ✓ docenten/brightspacosaurus-handleiding.pdf`);
      } else {
        const bssStderr = new TextDecoder().decode(bssResult.stderr);
        console.warn(`  ⚠ BSS-handleiding-PDF mislukt (niet-blokkerend):`);
        console.warn(`    ${bssStderr.trim()}`);
        await Deno.remove(bssOutput).catch(() => undefined);
      }
    } catch {
      // BSS-handleiding niet gevonden — overslaan
    }
    } // einde if (!readersOnly) voor BSS-handleiding
  } else {
    console.warn("⚠ pandoc niet gevonden — docentenhandleiding-PDF overgeslagen.");
  }

  console.log(`Prepare voltooid.`);
}

async function runPack(repoRoot: string, sourcesDir: string, output: string = ""): Promise<void> {
  const buildDir = resolveBuildDir(repoRoot, output);

  // Lees versienummer en naam uit package.json
  const packageJsonPath = join(repoRoot, "package.json");
  const packageJson = JSON.parse(await Deno.readTextFile(packageJsonPath));
  const version = packageJson.version || "0.0.0";

  // Bepaal output-pad: --output wint, anders rc-bestand, anders package.json name
  let outputPath: string;
  if (output) {
    // output kan een volledig relatief pad zijn (bijv. "oose-dt/build/OOSE-DT-SAD")
    // of alleen een naam (bijv. "OOSE-DT-SAD")
    if (output.endsWith(".imscc")) {
      // Expliciet .imscc pad: absoluut of relatief t.o.v. repoRoot
      outputPath = output.startsWith("/") ? output : join(repoRoot, output);
    } else {
      // Gebruik buildDir-parent als output-map, output-basename als naam
      const outputName = basename(output);
      outputPath = join(dirname(buildDir), `${outputName}.v${version}.imscc`);
    }
  } else {
    // Lees naam uit .brightspacosaurus.json of valt terug op package.json name
    let projectName = packageJson.name || basename(repoRoot);
    try {
      const rcPath = join(repoRoot, ".brightspacosaurus.json");
      const rc = JSON.parse(await Deno.readTextFile(rcPath));
      if (rc.name) projectName = rc.name;
    } catch { /* geen rc-bestand */ }
    outputPath = join(dirname(buildDir), `${projectName}.v${version}.imscc`);
  }

  // Eerst prepare uitvoeren als build/brightspace/content/ niet bestaat
  try {
    await Deno.stat(join(buildDir, "content"));
  } catch {
    console.log("build/brightspace/content/ niet gevonden, voer eerst prepare uit...");
    await runPrepare(repoRoot, sourcesDir, false, output);
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

        // Gebruik H1 uit de HTML als titel (valt terug op bestandsnaam)
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = h1Match ? h1Match[1].trim() : basename(fullPath, extname(fullPath));

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

  const manifestXml = buildManifest("OWE 1 - Full Stack Engineering", entries);
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

  // Bepaal de repository-root (drie niveaus omhoog vanuit scripts/brightspacosaurus/src/)
  const scriptDir = new URL(".", import.meta.url).pathname;
  const repoRoot = resolve(scriptDir, "..", "..", "..");

  try {
    if (parsed.command === "prepare") {
      await runPrepare(repoRoot, parsed.sources, parsed.readersOnly, parsed.output);
    } else if (parsed.command === "pack") {
      await runPack(repoRoot, parsed.sources, parsed.output);
    }
  } catch (e) {
    const error = e as Error & { exitCode?: number };
    console.error(`Fout: ${error.message}`);
    Deno.exit(error.exitCode ?? 1);
  }
}

main();
