import { resolve } from "@std/path";
import { PLAYWRIGHT_VERSION } from "../src/pptx/browser.ts";

const root = Deno.cwd();
const cache = resolve(root, "build/slide-browser");
const temp = resolve(root, "build/browser-tmp");
await Deno.mkdir(temp, { recursive: true });
console.log(`Installing Playwright ${PLAYWRIGHT_VERSION} Chromium in ${cache}`);
const status = await new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "-A",
    `npm:playwright@${PLAYWRIGHT_VERSION}`,
    "install",
    "chromium",
    "--no-shell",
  ],
  env: { PLAYWRIGHT_BROWSERS_PATH: cache, TMPDIR: temp },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}).spawn().status;
if (!status.success) Deno.exit(status.code);
