/*
 * Copy button for code blocks in exported lesson pages (#16).
 *
 * Adds a "Kopieer" button to every `pre > code` block. Copies through the
 * Clipboard API, with a hidden-textarea fallback for browsers or frames where
 * that API is unavailable. Without JavaScript the code block stays as it is.
 */
(function (root) {
  "use strict";

  const LABEL = "Kopieer";
  const COPIED_LABEL = "Gekopieerd!";
  const FAILED_LABEL = "Kopiëren mislukt";
  const RESET_MS = 1500;

  /** Copies text; resolves to true on success and false on failure. */
  function copyText(text, doc, clipboard) {
    if (clipboard && typeof clipboard.writeText === "function") {
      return clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return copyWithTextarea(text, doc);
        },
      );
    }
    return Promise.resolve(copyWithTextarea(text, doc));
  }

  /** Fallback via a temporary textarea and the legacy copy command. */
  function copyWithTextarea(text, doc) {
    const textarea = doc.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    doc.body.appendChild(textarea);
    textarea.select();
    try {
      return doc.execCommand("copy") === true;
    } catch (_err) {
      return false;
    } finally {
      doc.body.removeChild(textarea);
    }
  }

  /** Wraps each code block and adds its button; safe to call twice. */
  function initializeCopyButtons(doc, clipboard) {
    doc.querySelectorAll("pre > code").forEach(function (code) {
      const pre = code.parentElement;
      if (pre.dataset.bsoCopyWrapped) return;
      pre.dataset.bsoCopyWrapped = "true";

      const wrapper = doc.createElement("div");
      wrapper.className = "bso-code-wrapper";
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const button = doc.createElement("button");
      button.type = "button";
      button.className = "bso-copy-btn";
      button.textContent = LABEL;
      button.setAttribute("aria-label", "Kopieer code");
      let timer = null;
      button.addEventListener("click", function () {
        copyText(code.innerText, doc, clipboard).then(function (ok) {
          button.textContent = ok ? COPIED_LABEL : FAILED_LABEL;
          clearTimeout(timer);
          timer = setTimeout(function () {
            button.textContent = LABEL;
          }, RESET_MS);
        });
      });
      wrapper.appendChild(button);
    });
  }

  root.bsoCopyButton = {
    copyText: copyText,
    initializeCopyButtons: initializeCopyButtons,
  };

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      initializeCopyButtons(
        document,
        typeof navigator !== "undefined" ? navigator.clipboard : undefined,
      );
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
