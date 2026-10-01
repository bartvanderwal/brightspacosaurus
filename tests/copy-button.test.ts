import { assertEquals } from "@std/assert";
import { loadAssetText } from "../src/assets.ts";

interface Clipboard {
  writeText(text: string): Promise<void>;
}
interface CopyButton {
  copyText(text: string, doc: unknown, clipboard?: Clipboard): Promise<boolean>;
}

/** Evaluates the browser asset without a DOM; it only exposes its helpers. */
async function loadCopyButton(): Promise<CopyButton> {
  const sandbox: { bsoCopyButton?: CopyButton } = {};
  new Function(
    "globalThis",
    await loadAssetText("brightspacosaurus-copy-button.js"),
  )(sandbox);
  return sandbox.bsoCopyButton!;
}

const copyButton = await loadCopyButton();

/** Minimal document for the textarea fallback; records what was copied. */
function fakeDocument(copyResult: boolean | "throw") {
  const state = { copied: "", attached: 0 };
  const doc = {
    body: {
      appendChild: () => state.attached++,
      removeChild: () => state.attached--,
    },
    createElement: () => {
      const textarea = {
        value: "",
        style: {},
        setAttribute: () => {},
        select: () => {
          state.copied = textarea.value;
        },
      };
      return textarea;
    },
    execCommand: () => {
      if (copyResult === "throw") throw new Error("not allowed");
      return copyResult;
    },
  };
  return { doc, state };
}

Deno.test("copyText uses the Clipboard API when available", async () => {
  const written: string[] = [];
  const { doc, state } = fakeDocument(false);
  const ok = await copyButton.copyText("git clone x", doc, {
    writeText: (text) => {
      written.push(text);
      return Promise.resolve();
    },
  });
  assertEquals(ok, true);
  assertEquals(written, ["git clone x"]);
  assertEquals(state.copied, "", "fallback must not run");
});

Deno.test("copyText falls back to a textarea without Clipboard API", async () => {
  const { doc, state } = fakeDocument(true);
  assertEquals(await copyButton.copyText("mvn test", doc), true);
  assertEquals(state.copied, "mvn test");
  assertEquals(state.attached, 0, "textarea must be removed again");
});

Deno.test("copyText falls back when the Clipboard API rejects", async () => {
  const { doc, state } = fakeDocument(true);
  const ok = await copyButton.copyText("ls", doc, {
    writeText: () => Promise.reject(new Error("denied")),
  });
  assertEquals(ok, true);
  assertEquals(state.copied, "ls");
});

Deno.test("copyText reports failure when no copy route works", async () => {
  for (const result of [false, "throw"] as const) {
    const { doc, state } = fakeDocument(result);
    assertEquals(await copyButton.copyText("x", doc), false);
    assertEquals(state.attached, 0, "textarea must be removed after failure");
  }
});
