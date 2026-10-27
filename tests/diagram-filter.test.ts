import { assertEquals, assertStringIncludes } from "@std/assert";

// Spec *Diagrams in a reader*, rule R1: the picture comes first, the source follows it on the same page.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

async function run(markdown: string): Promise<string> {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    () => new Response(PNG, { headers: { "content-type": "image/png" } }),
  );
  try {
    const filter = new URL("../assets/diagram-filter.lua", import.meta.url)
      .pathname;
    const child = new Deno.Command("pandoc", {
      args: ["-f", "markdown", "-t", "native", `--lua-filter=${filter}`],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      env: { BSO_KROKI_URL: `http://127.0.0.1:${server.addr.port}` },
    }).spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(markdown));
    await writer.close();
    const output = await child.output();
    return new TextDecoder().decode(output.stdout);
  } finally {
    await server.shutdown();
  }
}

Deno.test("R1: a diagram is an image with a limited height, then the source block, and a page break between them is discouraged", async () => {
  const native = await run("```mermaid\nflowchart TD\n  A --> B\n```\n");
  const image = native.indexOf("Image");
  const pageBreak = native.indexOf("nopagebreak");
  const source = native.indexOf("CodeBlock");
  assertEquals(image >= 0 && image < pageBreak && pageBreak < source, true);
  assertStringIncludes(native, '( "height" , "45%" )');
});
