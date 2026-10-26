// @ts-self-types="./brightspacosaurus-goals.d.ts"
/**
 * Learning goals that a student ticks off. The state lives in the localStorage
 * of this browser only: no server, no account (#167). One key for each goal:
 * the path of the page and a hash of the text of the goal, with a version.
 */
function goalHash(text) {
  // FNV-1a, 32 bits: short and the same everywhere.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function goalKey(pathname, text) {
  const page = pathname.replace(/\/index\.html$/, "/").replace(/\/+$/, "");
  return "bso:goals:v1:" + page + ":" + goalHash(text.replace(/\s+/g, " ").trim());
}

/** The browser's storage, or null when it is missing or blocked. */
function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (_error) {
    return null;
  }
}

/** Enhance the shared markup; safe to call after each preview navigation. */
function initializeGoals(root, env) {
  const storage = env && "storage" in env ? env.storage : defaultStorage();
  const pathname = env && env.pathname !== undefined
    ? env.pathname
    : (globalThis.location ? globalThis.location.pathname : "");
  root.querySelectorAll(".bso-goals").forEach(function (section) {
    if (section.dataset.bsoGoalsReady) return;
    section.dataset.bsoGoalsReady = "true";
    const goals = section.querySelectorAll(".bso-goal");
    const template = section.dataset.bsoProgressLabel || "{done} of {total} checked";
    const progress = document.createElement("p");
    progress.className = "bso-goals-progress";
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    const update = function () {
      let done = 0;
      goals.forEach(function (goal) {
        const box = goal.querySelector(".bso-goal-check");
        if (box && box.checked) done++;
      });
      progress.textContent = template
        .replace("{done}", String(done))
        .replace("{total}", String(goals.length));
    };
    goals.forEach(function (goal) {
      const box = goal.querySelector(".bso-goal-check");
      const text = goal.querySelector(".bso-goal-text");
      if (!box || !text) return;
      const key = goalKey(pathname, text.textContent || "");
      try {
        box.checked = storage ? storage.getItem(key) === "1" : false;
      } catch (_error) {
        box.checked = false;
      }
      goal.classList.toggle("is-done", box.checked);
      box.addEventListener("change", function () {
        goal.classList.toggle("is-done", box.checked);
        try {
          if (storage) {
            if (box.checked) storage.setItem(key, "1");
            else storage.removeItem(key);
          }
        } catch (_error) {
          // Storage is full or blocked: the box still works, it just forgets.
        }
        update();
      });
    });
    update();
    section.insertBefore(progress, section.firstChild);
  });
}

if (typeof globalThis !== "undefined") {
  globalThis.bsoGoals = { initializeGoals, goalKey };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initializeGoals, goalKey };
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    initializeGoals(document);
  });
}
