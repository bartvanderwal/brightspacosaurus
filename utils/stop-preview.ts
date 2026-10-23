/**
 * Stops the process that listens on the preview port (3000 by default), for
 * example a Docusaurus dev server that kept running after its terminal closed.
 * It names each process before it stops it (no magic).
 *
 * Usage: `deno task stop [port]`
 *
 * @module
 */

/** The process ids in the output of `lsof -ti :<port>` (one per line). */
export function parsePids(output: string): number[] {
  return [
    ...new Set(
      output.split(/\s+/).filter((part) => /^\d+$/.test(part)).map(Number),
    ),
  ];
}

async function run(command: string, args: string[]): Promise<string> {
  try {
    const result = await new Deno.Command(command, {
      args,
      stdout: "piped",
      stderr: "null",
    }).output();
    return new TextDecoder().decode(result.stdout);
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const port = Number(Deno.args[0] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Usage: deno task stop [port]");
    Deno.exit(2);
  }
  if (Deno.build.os === "windows") {
    console.error(
      `On Windows, find the process with 'netstat -ano | findstr :${port}' and stop it with 'taskkill /PID <pid> /F'.`,
    );
    Deno.exit(1);
  }
  const pids = parsePids(
    await run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]),
  );
  if (pids.length === 0) {
    console.log(`Nothing is listening on port ${port}.`);
    return;
  }
  for (const pid of pids) {
    const command = (await run("ps", ["-p", String(pid), "-o", "command="]))
      .trim();
    console.log(`Stopping process ${pid} on port ${port}: ${command}`);
    Deno.kill(pid, "SIGTERM");
  }
}

if (import.meta.main) await main();
