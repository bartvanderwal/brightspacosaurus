// @ts-self-types="./brightspacosaurus-slides.d.ts"
/**
 * Hidden preview-only presentation shortcut. Read the current document on each
 * keypress so client-side navigation cannot leave a previous lesson selected.
 */
function presentLessonSlides(event, doc, browser) {
  if (
    !event.altKey || event.code !== "KeyP" || event.ctrlKey ||
    event.metaKey || event.shiftKey || event.repeat || event.defaultPrevented
  ) return;

  const editable = (element) =>
    element?.isContentEditable ||
    element?.closest?.(
      "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
    );
  if (editable(doc.activeElement) || event.composedPath().some(editable)) {
    return;
  }

  const path = doc.querySelector("article [data-bso-slides]")?.getAttribute(
    "data-bso-slides",
  );
  if (!path) return;
  const url = new URL(path, browser.location.href);
  if (url.origin !== browser.location.origin) return;
  event.preventDefault();
  browser.open(url.href, "_blank", "noopener,noreferrer");
}

const BUTTON_STYLE = `
.bso-slides-button{position:fixed;z-index:50;top:calc(var(--ifm-navbar-height,3.75rem) + .6rem);right:1rem;display:inline-flex;align-items:center;gap:.4em;padding:.15rem .6rem;border:1px solid var(--ifm-color-emphasis-300,#c9ced6);border-radius:999px;font-size:.78rem;line-height:1.4;color:var(--ifm-color-emphasis-700,#4b5563);text-decoration:none;background:var(--ifm-background-surface-color,transparent)}
.bso-slides-button:hover{border-color:var(--ifm-color-primary,#0b6bcb);color:var(--ifm-color-primary,#0b6bcb);text-decoration:none}
.bso-slides-button kbd{font:inherit;font-size:.7rem;padding:0 .3rem;border:1px solid var(--ifm-color-emphasis-300,#c9ced6);border-radius:4px}
@media print{.bso-slides-button{display:none}}`;

/**
 * Show a small, visible "this lesson has slides" button, fixed below the
 * navbar. It lives on `document.body`, outside the React-managed article, so
 * hydration is left alone; it is added or removed for the current document,
 * because Docusaurus navigates without reloading the page.
 */
function showSlidesButton(doc, browser) {
  const article = doc.querySelector("article");
  const path = article?.querySelector("[data-bso-slides]")?.getAttribute(
    "data-bso-slides",
  );
  const existing = doc.querySelector("a.bso-slides-button");
  if (!path) {
    existing?.remove();
    return;
  }
  const url = new URL(path, browser.location.href);
  if (url.origin !== browser.location.origin) return;
  if (existing && existing.href === url.href) return;
  existing?.remove();
  if (!doc.getElementById("bso-slides-button-style")) {
    const style = doc.createElement("style");
    style.id = "bso-slides-button-style";
    style.textContent = BUTTON_STYLE;
    doc.head.append(style);
  }
  const button = doc.createElement("a");
  button.className = "bso-slides-button";
  button.href = url.href;
  button.target = "_blank";
  button.rel = "noopener noreferrer";
  button.title = "Open this lesson as slides (Alt/Option+P)";
  button.innerHTML =
    "<span aria-hidden='true'>▶</span> Slides <kbd>Alt+P</kbd>";
  doc.body.append(button);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => presentLessonSlides(event, document, window),
  );
  let pending = false;
  const update = () => {
    pending = false;
    showSlidesButton(document, window);
  };
  new MutationObserver(() => {
    if (!pending) {
      pending = true;
      queueMicrotask(update);
    }
  }).observe(document.body, { childList: true, subtree: true });
  update();
}
