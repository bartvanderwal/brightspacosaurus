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
  assertEquals(result.stderr.includes("Usage:"), true, "stderr moet usage bevatten");
});

Deno.test("Eigenschap 6: ongeldig commando geeft usage naar stderr en exitcode 1", async () => {
  // Feature: brightspacosaurus, Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
  const result = await runCli(["onzin"]);
  assertEquals(result.code, 1, "Exitcode moet 1 zijn bij ongeldig commando");
  assertEquals(result.stderr.includes("Usage:"), true, "stderr moet usage bevatten");
});

Deno.test("--version geeft versienummer naar stdout en exitcode 0", async () => {
  // Issue #9: toon versienummer via --version / -v
  const result = await runCli(["--version"]);
  assertEquals(result.code, 0, "Exitcode moet 0 zijn bij --version");
  assertEquals(
    /^brightspacosaurus v\d+\.\d+\.\d+/.test(result.stdout.trim()),
    true,
    "stdout moet 'brightspacosaurus v<version>' bevatten",
  );
});

Deno.test("-v geeft versienummer naar stdout en exitcode 0", async () => {
  // Issue #9: korte vorm -v
  const result = await runCli(["-v"]);
  assertEquals(result.code, 0, "Exitcode moet 0 zijn bij -v");
  assertEquals(result.stdout.includes("brightspacosaurus v"), true, "stdout moet versie bevatten");
});

Deno.test("--help geeft usage met versie-header naar stdout en exitcode 0", async () => {
  // Issue #9: --help / -h toont usage met versie-header
  const result = await runCli(["--help"]);
  assertEquals(result.code, 0, "Exitcode moet 0 zijn bij --help");
  assertEquals(result.stdout.includes("Brightspacosaurus v"), true, "stdout moet versie-header bevatten");
  assertEquals(result.stdout.includes("Usage:"), true, "stdout moet usage bevatten");
});

Deno.test("Eigenschap 6: prepare met niet-bestaande bronmap geeft fout naar stderr en exitcode ongelijk aan nul", async () => {
  // Feature: brightspacosaurus, Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode
  const result = await runCli(["prepare", "--sources", "/niet/bestaand/pad"]);
  assertEquals(result.code !== 0, true, "Exitcode moet ongelijk aan nul zijn");
  assertEquals(result.stderr.includes("Error:"), true, "stderr moet een foutmelding bevatten");
});
