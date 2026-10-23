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
  // The same tab: the browser's Back button returns to the lesson (ADR 022).
  browser.location.assign(url.href);
}

const BUTTON_STYLE = `
.bso-slides-button{position:fixed;z-index:50;top:4.5rem;right:1rem;box-shadow:0 1px 4px rgba(0,0,0,.15);display:inline-flex;align-items:center;gap:.4em;padding:.15rem .6rem;border:1px solid var(--ifm-color-emphasis-300,#c9ced6);border-radius:999px;font-size:.78rem;line-height:1.4;color:var(--ifm-color-emphasis-700,#4b5563);text-decoration:none;background:var(--ifm-background-surface-color,transparent)}
.bso-slides-button:hover{border-color:var(--ifm-color-primary,#0b6bcb);color:var(--ifm-color-primary,#0b6bcb);text-decoration:none}
.bso-slides-button kbd{font:inherit;font-size:.7rem;padding:0 .3rem;border:1px solid var(--ifm-color-emphasis-300,#c9ced6);border-radius:4px}
@media print{.bso-slides-button{display:none}}`;

/** Keeps the button just below the navbar, whatever the theme's navbar margin and scroll position. */
function placeSlidesButton(doc) {
  const button = doc.querySelector("a.bso-slides-button");
  if (!button) return;
  const navbar = doc.querySelector("nav.navbar");
  const bottom = navbar
    ? Math.max(navbar.getBoundingClientRect().bottom, 0)
    : 0;
  button.style.top = `${bottom + 10}px`;
}

/**
 * Show a small, visible "this lesson has slides" button in the top right
 * corner, just below the navbar. It lives on `document.body`, outside the React-managed article, so
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
  button.title =
    "Show this lesson as slides (Alt/Option+P); use Back to return";
  button.innerHTML =
    "<span aria-hidden='true'>▶</span> Slides <kbd>Alt+P</kbd>";
  doc.body.append(button);
  placeSlidesButton(doc);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => presentLessonSlides(event, document, window),
  );
  const place = () => placeSlidesButton(document);
  window.addEventListener("scroll", place, { passive: true });
  window.addEventListener("resize", place);
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
