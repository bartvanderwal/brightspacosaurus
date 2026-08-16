/**
 * Tests voor SourceScanner.
 *
 * Feature: brightspacosaurus
 * Eigenschap 4: Uitvoerstructuur weerspiegelt bronstructuur
 * Eigenschap 5: Ongeldige invoerpaden geweigerd
 */

import { assertEquals, assertRejects } from "@std/assert";
import fc from "fast-check";
import { scanSources } from "../src/source-scanner.ts";
import { join, relative, resolve } from "@std/path";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_test_" });
}

async function writeFile(path: string, content = ""): Promise<void> {
  await Deno.mkdir(path.substring(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, content);
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

// ---------------------------------------------------------------------------
// Eigenschap 4: Uitvoerstructuur weerspiegelt bronstructuur
// Valideert: Requirements 3.5
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 4: scanSources geeft gesorteerde les-Markdown bestanden terug", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(
        fc.tuple(
          fc.constantFrom("week-1", "week-2", "week-3"),
          fc.stringMatching(/^lesoverzicht-[a-z0-9-]{1,8}$/)
        ),
        { minLength: 1, maxLength: 6, selector: ([dir, name]) => `${dir}/${name}` }
      ),
      async (entries) => {
        const tempRoot = await makeTempDir();
        const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
        try {
          const expectedPaths: string[] = [];
          for (const [weekDir, name] of entries) {
            const filePath = join(sourcesDir, weekDir, `${name}.md`);
            await writeFile(filePath, `# ${name}\n`);
            expectedPaths.push(resolve(filePath));
          }
          expectedPaths.sort();

          const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

          assertEquals(result.markdownFiles, expectedPaths, "Alle les-Markdown bestanden moeten worden gevonden");
          assertEquals(result.quizFiles.length, 0, "Geen quiz-bestanden verwacht");
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 30 }
  );
});

Deno.test("Eigenschap 4: scanSources classificeert quiz-bestanden op prefix", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(
        fc.constantFrom("week-1", "week-2", "week-3"),
        fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/)
      ),
      async ([weekDir, quizName]) => {
        const tempRoot = await makeTempDir();
        const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
        try {
          // Maak een regulier bestand en een quiz-bestand
          const lesPath = join(sourcesDir, weekDir, `lesoverzicht-1.md`);
          const quizPath = join(sourcesDir, weekDir, `quiz-${quizName}.md`);
          await writeFile(lesPath, "# Les\n");
          await writeFile(quizPath, "# Quiz\n");

          const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

          assertEquals(result.markdownFiles.length, 1, "1 les-bestand verwacht");
          assertEquals(result.quizFiles.length, 1, "1 quiz-bestand verwacht");
          assertEquals(result.markdownFiles[0], resolve(lesPath));
          assertEquals(result.quizFiles[0], resolve(quizPath));
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 20 }
  );
});

Deno.test("Eigenschap 4: scanSources behoudt geneste bronpaden gesorteerd per categorie", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(
        fc.record({
          kind: fc.constantFrom("les", "quiz", "antwoorden"),
          weekDir: fc.constantFrom("week-1", "week-2", "week-3"),
          sectionDir: fc.constantFrom("basis", "verdieping", "voorbereiding"),
          slug: fc.stringMatching(/^[a-z][a-z0-9-]{1,10}$/),
        }),
        {
          minLength: 3,
          maxLength: 12,
          selector: ({ kind, weekDir, sectionDir, slug }) => `${kind}/${weekDir}/${sectionDir}/${slug}`,
        },
      ),
      async (entries) => {
        const tempRoot = await makeTempDir();
        const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
        try {
          const expectedMarkdownRelPaths: string[] = [];
          const expectedQuizRelPaths: string[] = [];

          for (const entry of entries) {
            let fileName: string;
            if (entry.kind === "quiz") {
              fileName = `quiz-${entry.slug}.md`;
            } else if (entry.kind === "antwoorden") {
              fileName = `quiz-${entry.slug}-antwoorden-docent.md`;
            } else {
              fileName = `lesoverzicht-${entry.slug}.md`;
            }

            const filePath = join(sourcesDir, entry.weekDir, entry.sectionDir, fileName);
            await writeFile(filePath, `# ${entry.slug}\n`);

            const relPath = relative(sourcesDir, resolve(filePath));
            if (entry.kind === "les") {
              expectedMarkdownRelPaths.push(relPath);
            } else if (entry.kind === "quiz") {
              expectedQuizRelPaths.push(relPath);
            }
          }

          expectedMarkdownRelPaths.sort();
          expectedQuizRelPaths.sort();

          const result = await scanSources({ sourcesDir, repoRoot: tempRoot });
          const actualMarkdownRelPaths = result.markdownFiles.map((path) => relative(sourcesDir, path));
          const actualQuizRelPaths = result.quizFiles.map((path) => relative(sourcesDir, path));

          assertEquals(
            actualMarkdownRelPaths,
            expectedMarkdownRelPaths,
            "Les-Markdown bestanden moeten hun relatieve bronstructuur behouden",
          );
          assertEquals(
            actualQuizRelPaths,
            expectedQuizRelPaths,
            "Quiz-Markdown bestanden moeten hun relatieve bronstructuur behouden",
          );
        } finally {
          await removeDir(tempRoot);
        }
      },
    ),
    { numRuns: 30 },
  );
});

// ---------------------------------------------------------------------------
// Eigenschap 5: Ongeldige invoerpaden worden geweigerd
// Valideert: Requirements 1.3, 2.4, 6.1
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 5: paden buiten de repository-root worden geweigerd", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/), { minLength: 1, maxLength: 3 }),
      async (pathParts) => {
        const tempRoot = await makeTempDir();
        try {
          const outsidePath = resolve(tempRoot, "..", ...pathParts);
          await assertRejects(
            () => scanSources({ sourcesDir: outsidePath, repoRoot: tempRoot }),
            Error, undefined, "Pad buiten root moet worden geweigerd"
          );
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 30 }
  );
});

Deno.test("Eigenschap 5: niet-bestaande bronmap geeft fout met exitcode 2", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/),
      async (dirName) => {
        const tempRoot = await makeTempDir();
        try {
          const nonExistentDir = join(tempRoot, dirName);
          let caughtError: (Error & { exitCode?: number }) | null = null;
          try {
            await scanSources({ sourcesDir: nonExistentDir, repoRoot: tempRoot });
          } catch (e) {
            caughtError = e as Error & { exitCode?: number };
          }
          assertEquals(caughtError !== null, true, "Niet-bestaande bronmap moet een fout geven");
          assertEquals(caughtError?.exitCode, 2, "Exitcode moet 2 zijn");
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 20 }
  );
});

Deno.test("Eigenschap 5: foutmelding bevat het ongeldige pad", async () => {
  const tempRoot = await makeTempDir();
  try {
    const outsidePath = resolve(tempRoot, "..", "buiten-root");
    let caughtError: Error | null = null;
    try {
      await scanSources({ sourcesDir: outsidePath, repoRoot: tempRoot });
    } catch (e) {
      caughtError = e as Error;
    }
    assertEquals(caughtError !== null, true, "Er moet een fout worden gegooid");
    assertEquals(caughtError?.message.includes(outsidePath), true, "Foutmelding moet het ongeldige pad bevatten");
  } finally {
    await removeDir(tempRoot);
  }
});

// ---------------------------------------------------------------------------
// Reader-classificatie unit tests
// Valideert: Requirements 6.1
// ---------------------------------------------------------------------------

Deno.test("Reader-classificatie: bestanden op top-niveau met prefix reader- worden als reader geclassificeerd", async () => {
  const tempRoot = await makeTempDir();
  const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
  try {
    // Maak reader-bestanden op top-niveau
    await writeFile(join(sourcesDir, "reader-git-en-gitlab.md"), "# Git en GitLab\n");
    // Maak een week-submap met een lesbestand
    await writeFile(join(sourcesDir, "week-1", "lesoverzicht-1.1.md"), "# Les 1.1\n");

    const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

    assertEquals(result.readerFiles.length, 1, "Er moet 1 reader-bestand zijn");
    assertEquals(
      result.readerFiles[0],
      resolve(join(sourcesDir, "reader-git-en-gitlab.md")),
      "reader-git-en-gitlab.md moet in readerFiles staan"
    );
    // Reader mag niet in markdownFiles staan
    const readerInMarkdown = result.markdownFiles.some((f) => f.includes("reader-git-en-gitlab.md"));
    assertEquals(readerInMarkdown, false, "Reader-bestanden mogen niet in markdownFiles staan");
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("Reader-classificatie: plantuml-essentials.md wordt als reader herkend", async () => {
  const tempRoot = await makeTempDir();
  const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
  try {
    await writeFile(join(sourcesDir, "plantuml-essentials.md"), "# PlantUML Essentials\n");
    await writeFile(join(sourcesDir, "week-1", "lesoverzicht-1.1.md"), "# Les 1.1\n");

    const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

    assertEquals(result.readerFiles.length, 1, "Er moet 1 reader-bestand zijn");
    assertEquals(
      result.readerFiles[0],
      resolve(join(sourcesDir, "plantuml-essentials.md")),
      "plantuml-essentials.md moet in readerFiles staan"
    );
    const plantumlInMarkdown = result.markdownFiles.some((f) => f.includes("plantuml-essentials.md"));
    assertEquals(plantumlInMarkdown, false, "plantuml-essentials.md mag niet in markdownFiles staan");
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("Reader-classificatie: bestanden in week-x/ submappen worden niet als reader geclassificeerd", async () => {
  const tempRoot = await makeTempDir();
  const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
  try {
    // reader-bestand in submap mag NIET als reader worden herkend
    await writeFile(join(sourcesDir, "week-1", "reader-should-not-match.md"), "# Niet een reader\n");
    await writeFile(join(sourcesDir, "week-1", "lesoverzicht-1.1.md"), "# Les 1.1\n");

    const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

    assertEquals(result.readerFiles.length, 0, "Geen reader-bestanden verwacht in submappen");
    // Het reader-bestand in de submap moet in markdownFiles staan (het heeft geen quiz- prefix)
    const readerInMarkdown = result.markdownFiles.some((f) => f.includes("reader-should-not-match.md"));
    assertEquals(readerInMarkdown, true, "reader-bestand in submap moet in markdownFiles staan");
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("Reader-classificatie: TODO-prefix bestanden worden uitgesloten van readers", async () => {
  const tempRoot = await makeTempDir();
  const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
  try {
    await writeFile(join(sourcesDir, "TODO-readers.md"), "# TODO\n");
    await writeFile(join(sourcesDir, "reader-git-en-gitlab.md"), "# Git\n");
    await writeFile(join(sourcesDir, "week-1", "lesoverzicht-1.1.md"), "# Les 1.1\n");

    const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

    assertEquals(result.readerFiles.length, 1, "Alleen 1 reader verwacht (niet TODO-)");
    assertEquals(
      result.readerFiles[0],
      resolve(join(sourcesDir, "reader-git-en-gitlab.md")),
      "Alleen reader-git-en-gitlab.md moet als reader worden herkend"
    );
    // TODO-bestand mag niet in readerFiles staan
    const todoInReaders = result.readerFiles.some((f) => f.includes("TODO-readers.md"));
    assertEquals(todoInReaders, false, "TODO-prefix bestanden mogen niet in readerFiles staan");
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("Reader-classificatie: volledige mapstructuur met readers, lessen en uitgesloten bestanden", async () => {
  const tempRoot = await makeTempDir();
  const sourcesDir = join(tempRoot, "Lesbeschrijvingen");
  try {
    // Top-niveau: readers
    await writeFile(join(sourcesDir, "reader-git-en-gitlab.md"), "# Git\n");
    await writeFile(join(sourcesDir, "plantuml-essentials.md"), "# PlantUML\n");
    // Top-niveau: uitgesloten bestanden
    await writeFile(join(sourcesDir, "TODO-readers.md"), "# TODO\n");
    // Submap: les-bestanden en een reader-prefix bestand (mag niet als reader)
    await writeFile(join(sourcesDir, "week-1", "lesoverzicht-1.1.md"), "# Les 1.1\n");
    await writeFile(join(sourcesDir, "week-1", "reader-should-not-match.md"), "# Niet een reader\n");

    const result = await scanSources({ sourcesDir, repoRoot: tempRoot });

    // Controleer readerFiles
    assertEquals(result.readerFiles.length, 2, "2 reader-bestanden verwacht");
    const readerNames = result.readerFiles.map((f) => f.split("/").pop());
    assertEquals(readerNames.includes("reader-git-en-gitlab.md"), true);
    assertEquals(readerNames.includes("plantuml-essentials.md"), true);

    // Controleer dat readers NIET in markdownFiles staan
    const markdownNames = result.markdownFiles.map((f) => f.split("/").pop());
    assertEquals(markdownNames.includes("reader-git-en-gitlab.md"), false, "Reader mag niet in markdownFiles");
    assertEquals(markdownNames.includes("plantuml-essentials.md"), false, "Reader mag niet in markdownFiles");

    // Controleer dat TODO-bestand niet in readerFiles staat
    assertEquals(readerNames.includes("TODO-readers.md"), false, "TODO mag niet in readerFiles");

    // Controleer dat bestanden in week-1/ in markdownFiles staan (niet in readerFiles)
    assertEquals(markdownNames.includes("lesoverzicht-1.1.md"), true, "Les-bestand moet in markdownFiles");
    assertEquals(markdownNames.includes("reader-should-not-match.md"), true, "reader in submap moet in markdownFiles");

    // Controleer dat readerFiles gesorteerd zijn
    const sortedReaders = [...result.readerFiles].sort();
    assertEquals(result.readerFiles, sortedReaders, "readerFiles moeten gesorteerd zijn");
  } finally {
    await removeDir(tempRoot);
  }
});
