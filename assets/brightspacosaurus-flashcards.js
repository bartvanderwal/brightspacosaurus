/** Enhance shared flashcard markup; safe to call after each preview navigation. */
function initializeFlashcards(root) {
  root.querySelectorAll(".bso-flashcards").forEach(function (section) {
    if (section.dataset.bsoFlashcardsReady) return;
    section.dataset.bsoFlashcardsReady = "true";
    const cards = section.querySelectorAll(".bso-flashcard");
    const show = function (visible) {
      cards.forEach(function (card) {
        const definition = card.querySelector(".bso-flashcard-definition");
        const button = card.querySelector(".bso-flashcard-toggle");
        if (definition) definition.hidden = !visible;
        if (button) button.setAttribute("aria-expanded", String(visible));
      });
    };
    const toolbar = document.createElement("div");
    toolbar.className = "bso-flashcard-toolbar";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "bso-flashcard-global-toggle";
    toggle.textContent = "Show definitions";
    toggle.addEventListener("click", function () {
      const hidden = section.querySelector(".bso-flashcard-definition[hidden]");
      const visible = Boolean(hidden);
      show(visible);
      toggle.textContent = visible ? "Hide definitions" : "Show definitions";
    });
    toolbar.appendChild(toggle);
    section.insertBefore(toolbar, section.firstChild);
    cards.forEach(function (card) {
      const button = card.querySelector(".bso-flashcard-toggle");
      if (button) {
        button.addEventListener("click", function () {
          const definition = card.querySelector(".bso-flashcard-definition");
          if (!definition) return;
          const visible = definition.hidden;
          definition.hidden = !visible;
          button.setAttribute("aria-expanded", String(visible));
        });
      }
    });
    show(false);
  });
}

// Bundlers import the initializer; standalone Brightspace pages use the same
// asset as a classic inline script, with its existing DOMContentLoaded behavior.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { initializeFlashcards };
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    initializeFlashcards(document);
  });
}
