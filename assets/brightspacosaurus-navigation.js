/*
 * Brightspace topic navigation for exported lesson pages (#41).
 *
 * A relative link between lesson pages opens inside the topic iframe, so the
 * Brightspace content menu does not follow. When the page runs inside
 * Brightspace (same origin), this script looks up the target topic in the
 * course table of contents (Brightspace LE API, using the viewer's session)
 * and lets Brightspace open that topic, which updates menu and navigation.
 * On any failure the ordinary relative link is followed, as before.
 */
(function (root) {
  "use strict";

  var FALLBACK_LE_VERSION = "1.67";
  var TIMEOUT_MS = 4000;

  /** Org unit id from the Brightspace viewer URL or the topic file URL. */
  function orgUnitFrom(topPath, framePath) {
    var match = /\/d2l\/le\/(?:content|lessons)\/(\d+)(?:\/|$)/.exec(
      topPath || "",
    );
    if (match) return match[1];
    match = /\/content\/enforced\/(\d+)-/.exec(framePath || "");
    return match ? match[1] : null;
  }

  /** Comparable path: no origin, query or hash; decoded and lowercase. */
  function topicPath(url) {
    var path = String(url || "").replace(/^[a-z]+:\/\/[^/]+/i, "")
      .split(/[?#]/)[0];
    try {
      path = decodeURIComponent(path);
    } catch (_error) {
      // Keep the raw path when it is not valid percent-encoding.
    }
    return path.replace(/\/{2,}/g, "/").toLowerCase();
  }

  /** First topic (depth-first, in menu order) whose file URL is targetPath. */
  function findTopicId(toc, targetPath) {
    var wanted = topicPath(targetPath);
    function search(modules) {
      for (var i = 0; i < (modules || []).length; i++) {
        var module = modules[i];
        var topics = module.Topics || [];
        for (var j = 0; j < topics.length; j++) {
          if (topics[j].Url && topicPath(topics[j].Url) === wanted) {
            return topics[j].TopicId;
          }
        }
        var nested = search(module.Modules);
        if (nested != null) return nested;
      }
      return null;
    }
    return search(toc && toc.Modules);
  }

  /** Viewer URL for a topic, in the classic content or the Lessons experience. */
  function viewUrl(topPath, orgUnitId, topicId) {
    return /\/d2l\/le\/lessons\//.test(topPath || "")
      ? "/d2l/le/lessons/" + orgUnitId + "/topics/" + topicId
      : "/d2l/le/content/" + orgUnitId + "/viewContent/" + topicId + "/View";
  }

  /** Whether a click on this link should open another lesson topic. */
  function isLessonLinkClick(event, link, location) {
    if (
      event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey
    ) return false;
    var target = link.getAttribute("target");
    if (target && target !== "_self") return false;
    if (link.hasAttribute("download")) return false;
    if (link.origin !== location.origin) return false;
    if (!/\.html?$/i.test(link.pathname)) return false;
    return link.pathname !== location.pathname;
  }

  root.bsoTopicNavigation = {
    orgUnitFrom: orgUnitFrom,
    topicPath: topicPath,
    findTopicId: findTopicId,
    viewUrl: viewUrl,
    isLessonLinkClick: isLessonLinkClick,
  };

  if (typeof document === "undefined" || root.bsoTopicNavigationActive) return;
  root.bsoTopicNavigationActive = true;

  var tocRequests = {};

  function getJson(url) {
    var headers = { Accept: "application/json" };
    try {
      var token = root.localStorage.getItem("XSRF.Token");
      if (token) headers["X-Csrf-Token"] = token;
    } catch (_error) {
      // Storage can be unavailable; the request may still succeed.
    }
    return fetch(url, { credentials: "same-origin", headers: headers })
      .then(function (response) {
        if (!response.ok) throw new Error(url + ": " + response.status);
        return response.json();
      });
  }

  function loadToc(orgUnitId) {
    if (!tocRequests[orgUnitId]) {
      tocRequests[orgUnitId] = getJson("/d2l/api/versions/le")
        .then(function (info) {
          return info.LatestVersion || FALLBACK_LE_VERSION;
        }, function () {
          return FALLBACK_LE_VERSION;
        })
        .then(function (version) {
          return getJson(
            "/d2l/api/le/" + version + "/" + orgUnitId + "/content/toc",
          );
        });
      tocRequests[orgUnitId].catch(function () {
        delete tocRequests[orgUnitId];
      });
    }
    return tocRequests[orgUnitId];
  }

  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest &&
      event.target.closest("a[href]");
    if (!link || !isLessonLinkClick(event, link, root.location)) return;

    var top;
    var topPath;
    try {
      top = root.top;
      if (!top || top === root) return;
      topPath = top.location.pathname;
    } catch (_error) {
      return; // Cross-origin parent: not inside Brightspace.
    }
    var orgUnitId = orgUnitFrom(topPath, root.location.pathname);
    if (!orgUnitId) return;

    event.preventDefault();
    var href = link.href;
    var done = false;
    function go(url, win) {
      if (done) return;
      done = true;
      win.location.href = url;
    }
    var timer = setTimeout(function () {
      go(href, root);
    }, TIMEOUT_MS);
    loadToc(orgUnitId).then(function (toc) {
      clearTimeout(timer);
      var topicId = findTopicId(toc, link.pathname);
      if (topicId == null) go(href, root);
      else go(viewUrl(topPath, orgUnitId, topicId), top);
    }).catch(function () {
      clearTimeout(timer);
      go(href, root);
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
