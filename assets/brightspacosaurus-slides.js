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

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => presentLessonSlides(event, document, window),
  );
}
