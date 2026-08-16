/**
 * Property-based tests voor CLI-entry points.
 *
 * Feature: brightspacosaurus
 * Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
 */

import { assertEquals } from "@std/assert";
import { resolve, join } from "@std/path";

const MAIN_PATH = resolve(new URL(".", import.meta.url).pathname, "..", "src", "main.ts");

/**
 * Voert main.ts uit als subprocess en geeft stdout, stderr en exitcode terug.
 */
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-write", MAIN_PATH, ...args],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  return {
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
    code: output.code,
  };
}

// ---------------------------------------------------------------------------
// Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
// Valideert: Requirements 6.2, 6.5
// ---------------------------------------------------------------------------

Deno.test("Eigenschap 6: geen argumenten geeft usage naar stderr en exitcode 1", async () => {
  // Feature: brightspacosaurus, Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
  const result = await runCli([]);
  assertEquals(result.code, 1, "Exitcode moet 1 zijn bij ontbrekende argumenten");
  assertEquals(result.stderr.includes("Gebruik:"), true, "stderr moet usage bevatten");
});

Deno.test("Eigenschap 6: ongeldig commando geeft usage naar stderr en exitcode 1", async () => {
  // Feature: brightspacosaurus, Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
  const result = await runCli(["onzin"]);
  assertEquals(result.code, 1, "Exitcode moet 1 zijn bij ongeldig commando");
  assertEquals(result.stderr.includes("Gebruik:"), true, "stderr moet usage bevatten");
});

Deno.test("Eigenschap 6: prepare met niet-bestaande bronmap geeft fout naar stderr en exitcode ongelijk aan nul", async () => {
  // Feature: brightspacosaurus, Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
  const result = await runCli(["prepare", "--sources", "/niet/bestaand/pad"]);
  assertEquals(result.code !== 0, true, "Exitcode moet ongelijk aan nul zijn");
  assertEquals(result.stderr.includes("Fout:"), true, "stderr moet een foutmelding bevatten");
});
