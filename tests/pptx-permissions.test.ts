import { assertEquals, assertStringIncludes } from "@std/assert";

// Spec *Rendered PowerPoint export*, rule E5: a browser export needs no
// permission prompt in `deno task preview`, whose write permission is limited
// to the build and docs folders. Playwright's own artifacts go to the system
// temp folder unless TMPDIR points inside the build directory.
Deno.test("E5: the browser starts under the preview permissions without a prompt", async () => {
  const result = await new Deno.Command("deno", {
    args: [
      "run",
      "--no-prompt",
      "--allow-read",
      "--allow-write=build,demo-course-docs",
      "--allow-env",
      "--allow-sys",
      "--allow-run",
      "--allow-net",
      "tests/fixtures/pptx-permissions-check.ts",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stderr = new TextDecoder().decode(result.stderr);
  assertEquals(result.success, true, stderr);
  assertStringIncludes(new TextDecoder().decode(result.stdout), "launched ");
});

Deno.test("E5: the process temp folder is restored after a browser run", async () => {
  const before = Deno.env.get("TMPDIR");
  const { measureSlides } = await import("../src/pptx/browser.ts");
  await Deno.mkdir("build", { recursive: true });
  const html = await Deno.makeTempFile({ dir: "build", suffix: ".html" });
  try {
    await Deno.writeTextFile(
      html,
      "<html><body><section><h1>Title</h1></section></body></html>",
    );
    await measureSlides({
      htmlPath: html,
      repoRoot: Deno.cwd(),
      mode: "native",
      notice: "",
    });
  } finally {
    await Deno.remove(html);
  }
  assertEquals(Deno.env.get("TMPDIR"), before);
});
