/**
 * Property-based tests voor Packer.
 *
 * Feature: brightspacosaurus
 * Eigenschap 2: Idempotentie van de volledige pipeline
 * Eigenschap 7: Geen corrupt artefact bij archiveringsfout
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import { pack } from "../src/packer.ts";
import { join } from "@std/path";

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_test_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

// ---------------------------------------------------------------------------
// Eigenschap 2: Idempotentie van de volledige pipeline
// Valideert: Requirements 1.4, 2.2
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 2: twee keer pack op dezelfde invoer geeft byte-voor-byte identieke archieven", async () => {
  // Feature: brightspacosaurus, Eigenschap 2: Idempotentie van de volledige pipeline
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(
        fc.tuple(
          fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
          fc.stringMatching(/^[a-z][a-z0-9]{1,20}$/)
        ),
        { minLength: 1, maxLength: 5, selector: ([dir, name]) => `${dir}/${name}` }
      ),
      async (entries) => {
        const tempRoot = await makeTempDir();
        const sourceDir = join(tempRoot, "build");
        try {
          // Maak bestanden aan
          for (const [dir, name] of entries) {
            const subDir = join(sourceDir, dir);
            await Deno.mkdir(subDir, { recursive: true });
            await Deno.writeTextFile(join(subDir, `${name}.html`), `<html><body>${name}</body></html>`);
          }

          // Eerste pack
          const output1 = join(tempRoot, "out1.imscc");
          await pack({ sourceDir, outputPath: output1 });

          // Tweede pack
          const output2 = join(tempRoot, "out2.imscc");
          await pack({ sourceDir, outputPath: output2 });

          // Eigenschap: beide archieven zijn byte-voor-byte identiek
          const bytes1 = await Deno.readFile(output1);
          const bytes2 = await Deno.readFile(output2);
          assertEquals(bytes1.length, bytes2.length, "Archieven moeten dezelfde grootte hebben");
          assertEquals(bytes1, bytes2, "Archieven moeten byte-voor-byte identiek zijn");
        } finally {
          await removeDir(tempRoot);
        }
      }
    ),
    { numRuns: 20 }
  );
});

// ---------------------------------------------------------------------------
// Eigenschap 7: Geen corrupt artefact bij archiveringsfout
// Valideert: Requirements 6.3
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 7: lege bronmap geeft fout en geen artefact", async () => {
  // Feature: brightspacosaurus, Eigenschap 7: Geen corrupt artefact bij archiveringsfout
  const tempRoot = await makeTempDir();
  const sourceDir = join(tempRoot, "build");
  const outputPath = join(tempRoot, "cursus.imscc");
  try {
    await Deno.mkdir(sourceDir, { recursive: true });

    let caughtError: (Error & { exitCode?: number }) | null = null;
    try {
      await pack({ sourceDir, outputPath });
    } catch (e) {
      caughtError = e as Error & { exitCode?: number };
    }

    // Eigenschap: er moet een fout worden gegooid
    assertEquals(caughtError !== null, true, "Lege bronmap moet een fout geven");
    assertEquals(caughtError?.exitCode, 2, "Exitcode moet 2 zijn voor lege bronmap");

    // Eigenschap: er mag geen artefact achterblijven
    let fileExists = false;
    try {
      await Deno.stat(outputPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    assertEquals(fileExists, false, "Er mag geen artefact achterblijven bij een fout");
  } finally {
    await removeDir(tempRoot);
  }
});

Deno.test("Eigenschap 7: niet-bestaande bronmap geeft fout en geen artefact", async () => {
  // Feature: brightspacosaurus, Eigenschap 7: Geen corrupt artefact bij archiveringsfout
  const tempRoot = await makeTempDir();
  const outputPath = join(tempRoot, "cursus.imscc");
  try {
    let caughtError: (Error & { exitCode?: number }) | null = null;
    try {
      await pack({ sourceDir: join(tempRoot, "niet-bestaand"), outputPath });
    } catch (e) {
      caughtError = e as Error & { exitCode?: number };
    }

    assertEquals(caughtError !== null, true, "Niet-bestaande bronmap moet een fout geven");
    assertEquals(caughtError?.exitCode, 2, "Exitcode moet 2 zijn");

    let fileExists = false;
    try {
      await Deno.stat(outputPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    assertEquals(fileExists, false, "Er mag geen artefact achterblijven");
  } finally {
    await removeDir(tempRoot);
  }
});
