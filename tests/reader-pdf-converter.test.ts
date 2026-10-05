/**
 * Property tests voor ReaderPdfConverter.
 *
 * Feature: readers-en-pdf-export
 * - Property 1: PDF-conversie produceert uitvoer op juiste pad
 * - Property 3: Foutrapportage bij ongeldige invoer
 *
 * **Validates: Requirements 6.1, 6.5, 6.6, 7.2**
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { join, resolve } from "@std/path";
import { assertThrows } from "@std/assert";
import {
  resolveConfig,
  resolveFromCliOnly,
  validateConfig,
} from "../src/config-loader.ts";
import {
  buildReaderPandocArgs,
  convertReaderToPdf,
  coverImageHeader,
  coverLogoHeader,
  coverDatesHeader,
  deriveReaderPdfMetadata,
  gitLastCommitDate,
  pandocAvailable,
} from "../src/reader-pdf-converter.ts";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_pbt_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

/**
 * Controleert of een bestand bestaat op het opgegeven pad.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test("deriveReaderPdfMetadata gebruikt frontmatter voor verplicht voorblad", () => {
  const metadata = deriveReaderPdfMetadata(
    [
      "---",
      "title: Reader PlantUML essentials",
      "author: Bart van der Wal",
      "date: 2026-09-14",
      "version: 0.8.2",
      "---",
      "",
      "# Wordt niet gebruikt als titel",
    ].join("\n"),
    "plantuml-essentials.md",
    { courseName: "Fallback course", courseVersion: "1.2.3" },
  );

  assertEquals(metadata, {
    title: "Reader PlantUML essentials",
    author: "Bart van der Wal",
    date: "Datum: 2026-09-14 - 0.8.2",
    coverLines: ["Datum: 2026-09-14", "0.8.2"],
  });
});

Deno.test("deriveReaderPdfMetadata gebruikt H1 en cursusversie als fallback", () => {
  const metadata = deriveReaderPdfMetadata(
    "# Geheugenmodellen\n\nReadertekst.",
    "reader-geheugenmodellen.md",
    { courseName: "OWE 1", courseVersion: "2.1.0" },
  );

  assertEquals(metadata, {
    title: "Geheugenmodellen",
    author: "OWE 1",
    date: "Versie 2.1.0",
    coverLines: ["Versie 2.1.0"],
  });
});

Deno.test("deriveReaderPdfMetadata gebruikt Git-datum als datumfallback", () => {
  const metadata = deriveReaderPdfMetadata(
    "# Geheugenmodellen\n\nReadertekst.",
    "reader-geheugenmodellen.md",
    { courseName: "OWE 1", courseVersion: "2.1.0", sourceDate: "2026-09-14" },
  );

  assertEquals(metadata, {
    title: "Geheugenmodellen",
    author: "OWE 1",
    date: "Laatste wijziging: 2026-09-14 - Versie 2.1.0",
    coverLines: ["Laatste wijziging: 2026-09-14", "Versie 2.1.0"],
  });
});

Deno.test("gitLastCommitDate geeft null buiten een Git-repository", async () => {
  const tempRoot = await makeTempDir();
  try {
    const sourcePath = join(tempRoot, "reader-test.md");
    await Deno.writeTextFile(sourcePath, "# Test\n");
    assertEquals(await gitLastCommitDate(sourcePath, tempRoot), null);
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("buildReaderPandocArgs stuurt titlepage metadata en TOC naar pandoc", () => {
  const args = buildReaderPandocArgs({
    sourcePath: "/tmp/source/reader-test.md",
    outputPath: "/tmp/build/readers/reader-test.pdf",
    resourcePath: "/tmp/source",
    headerPath: "/tmp/reader-header.tex",
    includeFilterPath: "/tmp/include-filter.lua",
    diagramFilterPath: "/tmp/diagram-filter.lua",
    sectionNumberFilterPath: "/tmp/section-number-filter.lua",
    metadata: {
      title: "Reader Test",
      author: "OWE 1",
      date: "Versie 2.1.0",
      coverLines: ["Versie 2.1.0"],
    },
  });

  assertEquals(args.includes("--metadata=title:Reader Test"), true);
  assertEquals(args.includes("--metadata=author:OWE 1"), true);
  assertEquals(args.includes("--metadata=date:Versie 2.1.0"), true);
  assertEquals(args.includes("--toc"), true);
  assertEquals(args.includes("--number-sections"), true);
  assertEquals(args.includes("lang=nl"), true);
  assertEquals(
    args.includes("--include-in-header=/tmp/reader-header.tex"),
    true,
  );
});

Deno.test("coverImage uit de frontmatter komt in de metadata en een veilige LaTeX-header", () => {
  const metadata = deriveReaderPdfMetadata(
    "---\ntitle: Git\ncoverImage: img/git-branches.png\ncoverAlt: Branches\n---\n",
    "reader-git.md",
  );
  assertEquals(metadata.coverImage, "img/git-branches.png");
  assertEquals(
    "coverImage" in deriveReaderPdfMetadata("# Zonder omslag", "reader-x.md"),
    false,
  );
  assertEquals(
    coverImageHeader(
      "/repo/6.3.Studentenmateriaal/6.3.2.Readers/img/a_b-c.png",
    ),
    "\\newcommand{\\bsocoverimage}{/repo/6.3.Studentenmateriaal/6.3.2.Readers/img/a_b-c.png}\n",
  );
  assertEquals(
    coverImageHeader("C:\\repo\\img\\a.png"),
    "\\newcommand{\\bsocoverimage}{C:/repo/img/a.png}\n",
  );
  for (
    const unsafe of [
      "/img/met spatie.png",
      "/img/100%.png",
      "/img/a}b.png",
      "/img/#1.png",
    ]
  ) {
    assertEquals(coverImageHeader(unsafe), null, unsafe);
  }
});

Deno.test("buildReaderPandocArgs zet de omslag-header vóór de reader-header", () => {
  const base = {
    sourcePath: "/s/reader.md",
    outputPath: "/o/reader.pdf",
    resourcePath: "/s",
    headerPath: "/h/reader-header.tex",
    includeFilterPath: "/f/include.lua",
    diagramFilterPath: "/f/diagram.lua",
    sectionNumberFilterPath: "/tmp/section-number-filter.lua",
    metadata: { title: "T", date: "D", coverLines: [] },
  };
  const withCover = buildReaderPandocArgs({
    ...base,
    coverHeaderPath: "/o/.reader.pdf.cover.tex",
  });
  assertEquals(
    withCover.indexOf("--include-in-header=/o/.reader.pdf.cover.tex") <
      withCover.indexOf("--include-in-header=/h/reader-header.tex"),
    true,
  );
  assertEquals(
    buildReaderPandocArgs(base).some((arg) => arg.includes(".cover.tex")),
    false,
  );
});

Deno.test("reader-header toont de omslagafbeelding alleen als die gedefinieerd is", async () => {
  const header = await Deno.readTextFile("assets/reader-header.tex");
  assertEquals(header.includes("\\ifdefined\\bsocoverimage"), true);
  assertEquals(
    header.includes("keepaspectratio]{\\bsocoverimage}"),
    true,
  );
});

Deno.test({
  name:
    "convertReaderToPdf zet coverImage op het voorblad en waarschuwt bij een ontbrekend bestand",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true, env: true },
  fn: async () => {
    await Deno.mkdir("build", { recursive: true });
    const root = await Deno.makeTempDir({ dir: "build", prefix: "cover-" });
    try {
      await Deno.mkdir(join(root, "6.3.Readers", "img"), { recursive: true });
      await Deno.copyFile(
        "docs/images/brightspacosaurus.png",
        join(root, "6.3.Readers", "img", "cover.png"),
      );
      const write = (name: string, cover: string) =>
        Deno.writeTextFile(
          join(root, "6.3.Readers", name),
          `---\ntitle: Omslagtest\ncoverImage: ${cover}\n---\n\n## Inhoud\n\nTekst.\n`,
        );
      await write("reader-met.md", "img/cover.png");
      await write("reader-zonder.md", "img/ontbreekt.png");
      const outputDir = join(root, "out");
      const warnings: string[] = [];
      const warn = console.warn;
      console.warn = (message: string) => warnings.push(message);
      try {
        for (const name of ["reader-met.md", "reader-zonder.md"]) {
          await convertReaderToPdf({
            sourcePath: join(root, "6.3.Readers", name),
            outputDir,
            repoRoot: root,
          });
        }
      } finally {
        console.warn = warn;
      }
      const images = async (pdf: string) => {
        const output = await new Deno.Command("pdfimages", {
          args: ["-list", "-f", "1", "-l", "1", join(outputDir, pdf)],
          stdout: "piped",
          stderr: "null",
        }).output().catch(() => null);
        if (!output?.success) return null;
        return new TextDecoder().decode(output.stdout).trim().split("\n")
          .length - 2;
      };
      const withCover = await images("reader-met.pdf");
      if (withCover !== null) {
        assertEquals(withCover >= 1, true);
        assertEquals(await images("reader-zonder.pdf"), 0);
      } else {
        const size = async (pdf: string) =>
          (await Deno.stat(join(outputDir, pdf))).size;
        assertEquals(
          await size("reader-met.pdf") > await size("reader-zonder.pdf") + 5000,
          true,
        );
      }
      assertEquals(warnings.length, 1);
      assertEquals(warnings[0].includes("img/ontbreekt.png"), true);
      const leftovers = [...Deno.readDirSync(outputDir)].map((e) => e.name)
        .filter((name) => name.endsWith(".cover.tex"));
      assertEquals(leftovers, []);
    } finally {
      await removeDir(root);
    }
  },
});

Deno.test("reader-header definieert een aparte titlepage voor readers", async () => {
  const header = await Deno.readTextFile("assets/reader-header.tex");

  assertEquals(header.includes("\\begin{titlepage}"), true);
  assertEquals(header.includes("\\end{titlepage}"), true);
  assertEquals(header.includes("\\renewcommand{\\maketitle}"), true);
  assertEquals(header.includes("\\renewcommand{\\tableofcontents}"), true);
});

Deno.test("reader-header rendert vinktekens met DejaVu Sans", async () => {
  const header = await Deno.readTextFile("assets/reader-header.tex");

  assertEquals(
    header.includes("\\newfontfamily\\symbolfont{DejaVu Sans}"),
    true,
  );
  assertEquals(header.includes("\\newunicodechar{✔}{{\\symbolfont ✔}}"), true);
});

// ---------------------------------------------------------------------------
// Property 1: PDF-conversie produceert uitvoer op het juiste pad met correcte naamgeving
// Feature: readers-en-pdf-export, Property 1: PDF-conversie produceert uitvoer op juiste pad
// Validates: Requirements 6.1, 6.5, 7.2
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "Property 1: PDF-conversie produceert uitvoer op juiste pad met correcte naamgeving",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  fn: async () => {
    // Feature: readers-en-pdf-export, Property 1: PDF-conversie produceert uitvoer op juiste pad
    // **Validates: Requirements 6.1, 6.5, 7.2**
    //
    // Strategie: genereer willekeurige geldige reader-bestandsnamen (prefix reader- +
    // willekeurige slug), maak tijdelijke Markdown-bestanden, voer conversie uit,
    // controleer bestandsexistentie en naamgeving (.md → .pdf).
    await fc.assert(
      fc.asyncProperty(
        // Genereer willekeurige geldige reader-bestandsnamen: reader- + slug + .md
        fc.stringMatching(/^[a-z](?:[a-z0-9-]{0,18}[a-z0-9])$/).map(
          (slug) => `reader-${slug}.md`,
        ),
        async (readerFilename) => {
          const tempRoot = await makeTempDir();
          const sourceDir = join(tempRoot, "source");
          const outputDir = join(tempRoot, "output", "readers");

          try {
            // Maak bronmap en tijdelijk Markdown-bestand
            await Deno.mkdir(sourceDir, { recursive: true });
            const sourcePath = join(sourceDir, readerFilename);
            await Deno.writeTextFile(
              sourcePath,
              `# Test Reader\n\nDit is een test-reader voor ${readerFilename}.\n`,
            );

            // Voer conversie uit
            const result = await convertReaderToPdf({
              sourcePath,
              outputDir,
              repoRoot: tempRoot,
            });

            // Controleer: bestandsnaam is .md → .pdf
            const expectedPdfFilename = readerFilename.replace(
              /\.md$/,
              ".pdf",
            );
            assertEquals(
              result.filename,
              expectedPdfFilename,
              `Bestandsnaam moet ${expectedPdfFilename} zijn, maar was ${result.filename}`,
            );

            // Controleer: outputPath is in de juiste map
            assertEquals(
              result.outputPath,
              join(outputDir, expectedPdfFilename),
              "outputPath moet in de opgegeven uitvoermap staan",
            );

            // Controleer: PDF-bestand bestaat daadwerkelijk
            const fileInfo = await Deno.stat(result.outputPath);
            assertEquals(
              fileInfo.isFile,
              true,
              "Het gegenereerde PDF-bestand moet bestaan",
            );

            // Controleer: PDF-bestand is niet leeg
            assertEquals(
              fileInfo.size > 0,
              true,
              "Het gegenereerde PDF-bestand mag niet leeg zijn",
            );
          } finally {
            await removeDir(tempRoot);
          }
        },
      ),
      { numRuns: 10 },
    );
  },
});

// ---------------------------------------------------------------------------
// Property 3: Foutrapportage bij ongeldige invoer
// Feature: readers-en-pdf-export, Property 3: Foutrapportage bij ongeldige invoer
// Validates: Requirements 6.6
// ---------------------------------------------------------------------------

Deno.test({
  name:
    "Property 3: Foutrapportage — niet-bestaand bronbestand gooit fout met bronpad",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  fn: async () => {
    // Feature: readers-en-pdf-export, Property 3: Foutrapportage bij ongeldige invoer
    // **Validates: Requirements 6.6**
    //
    // Strategie: genereer willekeurige niet-bestaande bronpaden en controleer dat
    // convertReaderToPdf een fout gooit die het bronpad bevat, en dat er geen
    // gedeeltelijk PDF-bestand achterblijft.
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^reader-[a-z][a-z0-9-]{1,20}$/),
        async (readerSlug) => {
          const tempRoot = await makeTempDir();
          const outputDir = join(tempRoot, "output");
          // Bronbestand bestaat bewust NIET
          const nonExistentSource = join(
            tempRoot,
            "bronnen",
            `${readerSlug}.md`,
          );
          const expectedPdfPath = join(outputDir, `${readerSlug}.pdf`);

          try {
            // Verwacht dat conversie faalt
            let thrownError: Error | null = null;
            try {
              await convertReaderToPdf({
                sourcePath: nonExistentSource,
                outputDir,
                repoRoot: tempRoot,
              });
            } catch (e) {
              thrownError = e as Error;
            }

            // Controleer dat er een fout is gegooid
            assertEquals(
              thrownError !== null,
              true,
              `Conversie van niet-bestaand bestand ${nonExistentSource} moet een fout gooien`,
            );

            // Controleer dat de foutmelding het bronbestandspad bevat
            assertEquals(
              thrownError!.message.includes(nonExistentSource),
              true,
              `Foutmelding moet het bronpad bevatten. Foutmelding was: ${
                thrownError!.message
              }`,
            );

            // Controleer dat er geen PDF-bestand is achtergelaten
            const pdfLeftBehind = await fileExists(expectedPdfPath);
            assertEquals(
              pdfLeftBehind,
              false,
              `Er mag geen gedeeltelijk PDF-bestand achterblijven op ${expectedPdfPath}`,
            );
          } finally {
            await removeDir(tempRoot);
          }
        },
      ),
      { numRuns: 30 },
    );
  },
});

Deno.test({
  name:
    "Property 3: Foutrapportage — ongeldig Markdown met ongeldige LaTeX laat geen PDF achter",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true },
  fn: async () => {
    // Feature: readers-en-pdf-export, Property 3: Foutrapportage bij ongeldige invoer
    // **Validates: Requirements 6.6**
    //
    // Strategie: genereer Markdown-bestanden met ongeldige LaTeX-commando's die
    // pandoc laten falen. Controleer dat de foutmelding het bronpad bevat en dat
    // er geen gedeeltelijk PDF-bestand achterblijft.
    //
    // Pandoc faalt niet standaard op ontbrekende afbeeldingen, daarom gebruiken we
    // ongeldige LaTeX (\begin zonder \end) om een betrouwbare fout te forceren.
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^reader-[a-z][a-z0-9-]{1,15}$/),
        fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/),
        async (readerSlug, imageName) => {
          const tempRoot = await makeTempDir();
          const sourcesDir = join(tempRoot, "bronnen");
          const outputDir = join(tempRoot, "output");
          await Deno.mkdir(sourcesDir, { recursive: true });

          const sourcePath = join(sourcesDir, `${readerSlug}.md`);
          const expectedPdfPath = join(outputDir, `${readerSlug}.pdf`);

          // Maak een Markdown-bestand met ongeldige LaTeX die pandoc laat falen
          // Een onafgesloten \begin{} zonder \end{} veroorzaakt een LaTeX-fout
          const invalidContent = [
            `# Test reader ${readerSlug}`,
            "",
            `![Ontbrekende afbeelding](niet-bestaand-${imageName}.png)`,
            "",
            "```{=latex}",
            "\\begin{invalidenvironment}",
            "Dit is ongeldig LaTeX zonder bijbehorend \\end commando.",
            "```",
            "",
          ].join("\n");

          await Deno.writeTextFile(sourcePath, invalidContent);

          try {
            // Verwacht dat conversie faalt door ongeldige LaTeX
            let thrownError: Error | null = null;
            try {
              await convertReaderToPdf({
                sourcePath,
                outputDir,
                repoRoot: tempRoot,
              });
            } catch (e) {
              thrownError = e as Error;
            }

            // Controleer dat er een fout is gegooid
            assertEquals(
              thrownError !== null,
              true,
              `Conversie van ongeldig Markdown-bestand ${sourcePath} moet een fout gooien`,
            );

            // Controleer dat de foutmelding het bronbestandspad bevat
            assertEquals(
              thrownError!.message.includes(sourcePath),
              true,
              `Foutmelding moet het bronpad bevatten. Foutmelding was: ${
                thrownError!.message
              }`,
            );

            // Controleer dat er geen PDF-bestand is achtergelaten
            const pdfLeftBehind = await fileExists(expectedPdfPath);
            assertEquals(
              pdfLeftBehind,
              false,
              `Er mag geen gedeeltelijk PDF-bestand achterblijven op ${expectedPdfPath}`,
            );
          } finally {
            await removeDir(tempRoot);
          }
        },
      ),
      { numRuns: 20 },
    );
  },
});

Deno.test("coverLogoHeader defines bsocoverlogo and rejects unsafe paths", () => {
  assertEquals(
    coverLogoHeader("/repo/shared/han-logo.png"),
    "\\newcommand{\\bsocoverlogo}{/repo/shared/han-logo.png}\n",
  );
  assertEquals(
    coverLogoHeader("C:\\repo\\logo.png"),
    "\\newcommand{\\bsocoverlogo}{C:/repo/logo.png}\n",
  );
  for (const unsafe of ["/logo met spatie.png", "/logo%.png", "/a}b.png"]) {
    assertEquals(coverLogoHeader(unsafe), null, unsafe);
  }
});

Deno.test("reader-header shows the cover logo only when it is defined", async () => {
  const header = await Deno.readTextFile("assets/reader-header.tex");
  assertEquals(header.includes("\\ifdefined\\bsocoverlogo"), true);
  assertEquals(header.includes("keepaspectratio]{\\bsocoverlogo}"), true);
});

Deno.test("readerCoverLogo resolves against the repo root and must be a string", () => {
  const base = { courseName: "Test", version: "1", sourcesDir: "lessons" };
  assertEquals(resolveConfig(base, {}, Deno.cwd()).readerCoverLogo, null);
  assertEquals(
    resolveConfig({ ...base, readerCoverLogo: "shared/logo.png" }, {}, Deno.cwd())
      .readerCoverLogo,
    resolve("shared/logo.png"),
  );
  assertEquals(
    resolveFromCliOnly({ sources: "src" }, Deno.cwd()).readerCoverLogo,
    null,
  );
  assertEquals(
    validateConfig({ ...base, readerCoverLogo: "shared/logo.png" }),
    true,
  );
  assertThrows(
    () => validateConfig({ ...base, readerCoverLogo: 42 }),
    Error,
    "readerCoverLogo",
  );
});

Deno.test({
  name:
    "convertReaderToPdf puts the configured logo on the cover and warns when it is missing",
  ignore: !pandocAvailable(),
  permissions: { run: true, read: true, write: true, env: true },
  fn: async () => {
    await Deno.mkdir("build", { recursive: true });
    const root = await Deno.makeTempDir({ dir: "build", prefix: "logo-" });
    try {
      const logo = join(root, "logo.png");
      await Deno.copyFile("docs/images/brightspacosaurus.png", logo);
      const source = join(root, "reader-logo.md");
      await Deno.writeTextFile(
        source,
        "---\ntitle: Logotest\n---\n\n## Inhoud\n\nTekst.\n",
      );
      const withLogo = join(root, "met");
      const withoutLogo = join(root, "zonder");
      const warnings: string[] = [];
      const warn = console.warn;
      console.warn = (message: string) => warnings.push(message);
      try {
        await convertReaderToPdf({
          sourcePath: source,
          outputDir: withLogo,
          repoRoot: root,
          coverLogoPath: logo,
        });
        await convertReaderToPdf({
          sourcePath: source,
          outputDir: withoutLogo,
          repoRoot: root,
          coverLogoPath: join(root, "ontbreekt.png"),
        });
      } finally {
        console.warn = warn;
      }
      const size = async (dir: string) =>
        (await Deno.stat(join(dir, "reader-logo.pdf"))).size;
      assertEquals(await size(withLogo) > await size(withoutLogo) + 5000, true);
      assertEquals(warnings.length, 1);
      assertEquals(warnings[0].includes("readerCoverLogo"), true);
      assertEquals(
        [...Deno.readDirSync(withLogo)].some((e) => e.name.endsWith(".cover.tex")),
        false,
      );
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

// ---------------------------------------------------------------------------
// Original date and last change on the cover page
// ---------------------------------------------------------------------------

const withDate = "---\ndate: 2026-05-15\n---\n# Reader\n";

Deno.test("cover shows the original date and the Git date of the last change on two lines", () => {
  const metadata = deriveReaderPdfMetadata(withDate, "reader-x.md", {
    courseVersion: "0.4.0",
    sourceDate: "2026-10-01",
  });
  assertEquals(metadata.coverLines, [
    "Oorspronkelijke datum: 2026-05-15",
    "Laatste wijziging: 2026-10-01",
    "Versie 0.4.0",
  ]);
});

Deno.test("cover shows one date line when both dates are equal", () => {
  const metadata = deriveReaderPdfMetadata(withDate, "reader-x.md", { sourceDate: "2026-05-15" });
  assertEquals(metadata.coverLines, ["Datum: 2026-05-15"]);
});

Deno.test("without a Git date the last change falls back to updated in the front matter", () => {
  const metadata = deriveReaderPdfMetadata(
    "---\ndatum: 2026-05-15\nupdated: 2026-09-20\n---\n# R\n",
    "reader-x.md",
    { sourceDate: null },
  );
  assertEquals(metadata.coverLines, ["Oorspronkelijke datum: 2026-05-15", "Laatste wijziging: 2026-09-20"]);
});

Deno.test("cover labels follow the locale", () => {
  const metadata = deriveReaderPdfMetadata(withDate, "reader-x.md", {
    courseVersion: "1.0.0",
    sourceDate: "2026-10-01",
    locale: "en",
  });
  assertEquals(metadata.coverLines, ["Original date: 2026-05-15", "Last updated: 2026-10-01", "Version 1.0.0"]);
});

Deno.test("coverDatesHeader escapes LaTeX and puts each line on its own row", () => {
  assertEquals(coverDatesHeader([]), null);
  assertEquals(
    coverDatesHeader(["Datum: 2026-05-15", "v1_2 & 100%"]),
    "\\newcommand{\\bsocoverdates}{Datum: 2026-05-15\\\\ v1\\_2 \\& 100\\%}\n",
  );
});

Deno.test("the reader header prints \\bsocoverdates on the cover when defined", async () => {
  const header = await Deno.readTextFile(new URL("../assets/reader-header.tex", import.meta.url));
  assertEquals(header.includes("\\ifdefined\\bsocoverdates\\bsocoverdates\\else\\@date\\fi"), true);
});

Deno.test("gitLastCommitDate ignores a shallow clone", async () => {
  const root = await Deno.makeTempDir();
  const git = (cwd: string, ...args: string[]) =>
    new Deno.Command("git", { args, cwd, stdout: "null", stderr: "null" }).output();
  try {
    const origin = join(root, "origin");
    await Deno.mkdir(origin);
    await git(origin, "init", "-q");
    await Deno.writeTextFile(join(origin, "reader-x.md"), "# R\n");
    await git(origin, "add", ".");
    await git(origin, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "x");
    await git(root, "clone", "-q", "--depth", "1", "--no-local", origin, "shallow");
    const shallow = join(root, "shallow");
    assertEquals(await gitLastCommitDate(join(shallow, "reader-x.md"), shallow), null);
    assertEquals(typeof await gitLastCommitDate(join(origin, "reader-x.md"), origin), "string");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Every chapter on a new page (#53)
// ---------------------------------------------------------------------------

const pandocBase = {
  sourcePath: "/tmp/r.md",
  outputPath: "/tmp/r.pdf",
  resourcePath: "/tmp",
  headerPath: "/tmp/h.tex",
  includeFilterPath: "/tmp/i.lua",
  diagramFilterPath: "/tmp/d.lua",
  sectionNumberFilterPath: "/tmp/section-number-filter.lua",
  metadata: { title: "T", date: "", coverLines: [] },
};

Deno.test("buildReaderPandocArgs adds the chapter filter after the other filters, only when given", () => {
  const withFilter = buildReaderPandocArgs({ ...pandocBase, chapterFilterPath: "/tmp/c.lua" });
  const filters = withFilter.filter((arg) => arg.startsWith("--lua-filter="));
  assertEquals(filters.at(-1), "--lua-filter=/tmp/c.lua");
  assertEquals(buildReaderPandocArgs(pandocBase).includes("--lua-filter=/tmp/c.lua"), false);
});

Deno.test("readerChapterNewPage must be a boolean", () => {
  assertThrows(
    () => validateConfig({ courseName: "C", version: "1", sourcesDir: "s", readerChapterNewPage: "nee" }),
    Error,
    "readerChapterNewPage",
  );
});

async function latexWithChapterFilter(markdown: string): Promise<string> {
  const { materializeAsset } = await import("../src/assets.ts");
  const filter = await materializeAsset("chapter-filter.lua");
  const cmd = new Deno.Command("pandoc", {
    args: ["-f", "markdown", "-t", "latex", `--lua-filter=${filter}`],
    stdin: "piped",
    stdout: "piped",
  }).spawn();
  const writer = cmd.stdin.getWriter();
  await writer.write(new TextEncoder().encode(markdown));
  await writer.close();
  return new TextDecoder().decode((await cmd.output()).stdout);
}

Deno.test({
  name: "chapter filter breaks before each ## chapter under a single # title, not before the title",
  ignore: !pandocAvailable(),
  fn: async () => {
    const latex = await latexWithChapterFilter(
      "# Titel\n\nIntro.\n\n## 1. Inleiding\n\nA\n\n```md\n## geen kop\n```\n\n## Bronnen\n\nB\n",
    );
    const lines = latex.split("\n").filter((line) => /clearpage|section\{/.test(line));
    assertEquals(lines.map((line) => line.replace(/\\label\{[^}]*\}/, "")), [
      "\\section{Titel}",
      "\\clearpage",
      "\\subsection{1. Inleiding}",
      "\\clearpage",
      "\\subsection{Bronnen}",
    ]);
  },
});

Deno.test({
  name: "chapter filter breaks before each # chapter when # occurs more than once",
  ignore: !pandocAvailable(),
  fn: async () => {
    const latex = await latexWithChapterFilter("# A\n\nx\n\n## Sub\n\n# B\n\ny\n");
    assertEquals((latex.match(/\\clearpage/g) ?? []).length, 2);
  },
});

Deno.test("buildReaderPandocArgs zet de documenttaal uit de locale", () => {
  const args = buildReaderPandocArgs({
    sourcePath: "s.md",
    outputPath: "o.pdf",
    resourcePath: ".",
    headerPath: "h.tex",
    includeFilterPath: "i.lua",
    diagramFilterPath: "d.lua",
    sectionNumberFilterPath: "n.lua",
    locale: "en",
    metadata: { title: "T", date: "", coverLines: [] },
  });
  assertEquals(args.includes("lang=en"), true);
  assertEquals(args.includes("lang=nl"), false);
});

Deno.test("diagrams.locale must be nl or en", () => {
  assertThrows(
    () => validateConfig({ courseName: "C", version: "1", sourcesDir: "s", diagrams: { locale: "de" } }),
    Error,
    "diagrams.locale",
  );
  validateConfig({ courseName: "C", version: "1", sourcesDir: "s", diagrams: { locale: "en" } });
});

async function latexWithSectionNumbers(markdown: string, title: string): Promise<string> {
  const { materializeAsset } = await import("../src/assets.ts");
  const filter = await materializeAsset("section-number-filter.lua");
  const cmd = new Deno.Command("pandoc", {
    args: ["-f", "markdown", "-t", "latex", `--metadata=title:${title}`, `--lua-filter=${filter}`],
    stdin: "piped",
    stdout: "piped",
  }).spawn();
  const writer = cmd.stdin.getWriter();
  await writer.write(new TextEncoder().encode(markdown));
  await writer.close();
  return new TextDecoder().decode((await cmd.output()).stdout);
}

const headings = (latex: string) =>
  latex.split("\n").filter((line) => /section\*?\{/.test(line)).map((line) => line.replace(/\\label\{[^}]*\}/, ""));

Deno.test({
  name: "section numbers: a single title equal to the cover title is dropped and chapters move up",
  ignore: !pandocAvailable(),
  fn: async () => {
    const latex = await latexWithSectionNumbers("# Titel\n\n## Een\n\n### Sub\n\n## Twee\n", "Titel");
    assertEquals(headings(latex), ["\\section{Een}", "\\subsection{Sub}", "\\section{Twee}"]);
  },
});

Deno.test({
  name: "section numbers: a single title that differs from the cover title stays, unnumbered",
  ignore: !pandocAvailable(),
  fn: async () => {
    const latex = await latexWithSectionNumbers("# Anders\n\n## Een\n", "Titel");
    assertEquals(headings(latex), ["\\section*{Anders}", "\\section{Een}"]);
  },
});

Deno.test({
  name: "section numbers: several top-level headings keep their levels",
  ignore: !pandocAvailable(),
  fn: async () => {
    const latex = await latexWithSectionNumbers("# A\n\n## Sub\n\n# B\n", "Titel");
    assertEquals(headings(latex), ["\\section{A}", "\\subsection{Sub}", "\\section{B}"]);
  },
});
