/*
 * Tabs on the teacher page (#37): "Informatie" and "Voortgangsverkenner".
 *
 * Without JavaScript both panels are shown one after the other. This script
 * shows the tab list, hides the inactive panel and supports the arrow, Home
 * and End keys (WAI-ARIA tabs pattern).
 */
(function (root) {
  "use strict";

  function initializeTabs(doc) {
    doc.querySelectorAll("[data-bso-tabs]").forEach(function (container) {
      // Class selectors: the role attribute text must not appear in every page,
      // because diagram tests check that no tab list is left in lesson HTML.
      const tablist = container.querySelector(".bso-tablist");
      // Docusaurus calls this after every route change; initialize once.
      if (!tablist || container.classList.contains("bso-tabs-enhanced")) return;
      const tabs = Array.from(tablist.querySelectorAll("button"));
      const select = function (tab, focus) {
        tabs.forEach(function (t) {
          const selected = t === tab;
          t.setAttribute("aria-selected", String(selected));
          t.tabIndex = selected ? 0 : -1;
          const panel = doc.getElementById(t.getAttribute("aria-controls"));
          if (panel) panel.hidden = !selected;
        });
        if (focus) tab.focus();
      };
      tabs.forEach(function (tab, i) {
        tab.addEventListener("click", function () {
          select(tab, false);
        });
        tab.addEventListener("keydown", function (e) {
          let next = null;
          if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
          else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
          else if (e.key === "Home") next = tabs[0];
          else if (e.key === "End") next = tabs[tabs.length - 1];
          if (next) {
            e.preventDefault();
            select(next, true);
          }
        });
      });
      container.classList.add("bso-tabs-enhanced");
      tablist.hidden = false;
      select(tabs[0], false);
    });
  }

  root.bsoTabs = { initializeTabs: initializeTabs };

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      initializeTabs(document);
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
