// Run by tests/pptx-permissions.test.ts with the permissions of `deno task preview`
// and no prompts: a write outside the build directory fails instead of asking.
import { measureSlides } from "../../src/pptx/browser.ts";

const root = Deno.cwd();
const html = `${root}/build/pptx-permissions-check.html`;
await Deno.mkdir(`${root}/build`, { recursive: true });
await Deno.writeTextFile(
  html,
  "<html><body><section><h1>Title</h1></section></body></html>",
);
try {
  const { browserVersion } = await measureSlides({
    htmlPath: html,
    repoRoot: root,
    mode: "native",
    notice: "",
  });
  console.log(`launched ${browserVersion}`);
} finally {
  await Deno.remove(html);
}
