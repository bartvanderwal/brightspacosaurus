// Brightspacosaurus Teacher Progress Dashboard (Voortgangsverkenner)

(function () {
  "use strict";

  // --- State ---
  let sessionToken = "";
  let config = {
    gitlabUrl: "https://gitlab.com",
    groupPath: "",
    subgroups: [],
    repos: [],
    teacherUsernames: [],
    requireCommentsForDone: false,
    orangeThresholdPercent: 10,
    redThresholdPercent: 50,
  };

  let activeSubgroup = "";
  let cachedData = null; // { version: 1, timestamp: string, students: Record<string, StudentData> }
  let currentOrangeThreshold = 10;
  let currentRedThreshold = 50;
  let currentRequireComments = false;

  // --- Pure Calculation Functions (matching BSO core) ---

  function extractStudentIdentifier(repoName, prefix) {
    if (!repoName || !prefix) return null;
    const cleanRepo = repoName.trim();
    const cleanPrefix = prefix.trim();
    const expectedPrefix = `${cleanPrefix}-`;
    if (!cleanRepo.startsWith(expectedPrefix)) return null;
    const postfix = cleanRepo.slice(expectedPrefix.length).trim();
    return postfix.length > 0 ? postfix : null;
  }

  function isTeacherCommit(authorOrCommitter, teacherUsernames) {
    if (!authorOrCommitter || !teacherUsernames || teacherUsernames.length === 0) {
      return false;
    }
    const normalizedCandidate = authorOrCommitter.trim().toLowerCase();
    return teacherUsernames.some(
      (teacher) => teacher.trim().toLowerCase() === normalizedCandidate
    );
  }

  function isWorkItemCommit(commitMessage, workItemIid) {
    if (!commitMessage || !Number.isInteger(workItemIid) || workItemIid <= 0) {
      return false;
    }
    const escapedIid = String(workItemIid);
    const pattern = new RegExp(`(?:^|[\\s(,.;:!?])#${escapedIid}(?=[\\s),.;:!?]|$)`);
    return pattern.test(commitMessage);
  }

  function evaluateWorkItem(item, requireComments) {
    const rawState = (item.state || "").trim().toLowerCase();
    const rawLabel = (item.statusLabel || "").trim().toLowerCase();
    const isDone = rawState === "closed" || rawLabel === "status::done" || rawLabel === "done";

    if (isDone) {
      if (item.studentCommitsCount <= 0) {
        return {
          color: "orange",
          reason: "Done without own student commits",
          isDone: false,
          isNeutral: false,
        };
      }
      if (requireComments && item.studentCommentsCount <= 0) {
        return {
          color: "orange",
          reason: "No comment/details provided in work item",
          isDone: false,
          isNeutral: false,
        };
      }
      return {
        color: "green",
        reason: "Done with student commits and required details",
        isDone: true,
        isNeutral: false,
      };
    }

    const isDoing = rawLabel === "status::doing" || rawLabel === "doing" ||
      (rawState === "opened" && item.studentCommitsCount > 0);

    if (isDoing) {
      return {
        color: "orange",
        reason: "In progress / doing",
        isDone: false,
        isNeutral: false,
      };
    }

    // Todo status
    const dueDate = item.dueDate ? new Date(item.dueDate) : null;
    if (dueDate && !isNaN(dueDate.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDay = new Date(dueDate);
      dueDay.setHours(0, 0, 0, 0);

      if (dueDay.getTime() > today.getTime()) {
        return {
          color: "gray",
          reason: `Not yet due (${item.dueDate.slice(0, 10)})`,
          isDone: false,
          isNeutral: true,
        };
      }
    }

    return {
      color: "red",
      reason: dueDate ? `Overdue (${item.dueDate.slice(0, 10)})` : "To do",
      isDone: false,
      isNeutral: false,
    };
  }

  function evaluateRepoStoplight(workItems, orangeThresh, redThresh, requireComments) {
    if (!workItems || workItems.length === 0) {
      return {
        color: "gray",
        incompletePercent: 0,
        scorableWorkItems: 0,
        totalWorkItems: 0,
        reason: "Geen work items gevonden",
      };
    }

    const evaluated = workItems.map((item) => evaluateWorkItem(item, requireComments));
    const scorableItems = evaluated.filter((item) => !item.isNeutral);
    const totalCount = evaluated.length;
    const scorableCount = scorableItems.length;

    if (scorableCount === 0) {
      return {
        color: "gray",
        incompletePercent: 0,
        scorableWorkItems: 0,
        totalWorkItems: totalCount,
        reason: "Alle work items hebben een toekomstige deadline (nog niet scoorbaar)",
      };
    }

    const nonGreenCount = scorableItems.filter((item) => item.color !== "green").length;
    const incompletePercent = (nonGreenCount / scorableCount) * 100;

    let color = "green";
    if (incompletePercent > redThresh) {
      color = "red";
    } else if (incompletePercent >= orangeThresh) {
      color = "orange";
    }

    return {
      color,
      incompletePercent,
      scorableWorkItems: scorableCount,
      totalWorkItems: totalCount,
      reason: `${incompletePercent.toFixed(1)}% onvolledig (${nonGreenCount}/${scorableCount} scoorbare items niet groen)`,
    };
  }

  // --- Storage & Cache Helpers ---

  function getCacheKey(subgroup) {
    return `bso_teacher_dashboard_${config.gitlabUrl}_${config.groupPath}_${subgroup}`;
  }

  function loadCachedData(subgroup) {
    try {
      const raw = localStorage.getItem(getCacheKey(subgroup));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && typeof parsed.students === "object") {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  function saveCachedData(subgroup, data) {
    try {
      localStorage.setItem(getCacheKey(subgroup), JSON.stringify(data));
    } catch (e) {
      console.warn("Kon gegevens niet opslaan in localStorage:", e);
    }
  }

  function clearCachedData(subgroup) {
    try {
      localStorage.removeItem(getCacheKey(subgroup));
    } catch (e) {
      console.warn("Kon cache niet wissen:", e);
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return "onbekend";
    try {
      const date = new Date(isoString);
      return date.toLocaleString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  }

  // --- GitLab API Client ---

  async function apiFetch(endpoint) {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${config.gitlabUrl.replace(/\/+$/, "")}/api/v4${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const headers = {};
    if (sessionToken) {
      headers["PRIVATE-TOKEN"] = sessionToken;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`GitLab API fout (${res.status}): ${res.statusText} ${errorText}`.trim());
    }

    // Support GitLab pagination via Link header or x-next-page
    const nextPage = res.headers.get("x-next-page");
    const json = await res.json();
    return { data: json, nextPage: nextPage && nextPage.trim().length > 0 ? nextPage.trim() : null };
  }

  async function apiFetchAll(endpoint) {
    let results = [];
    let page = 1;
    let url = endpoint;

    while (page) {
      const separator = url.includes("?") ? "&" : "?";
      const pagedUrl = `${url}${separator}page=${page}&per_page=100`;
      const response = await apiFetch(pagedUrl);
      if (Array.isArray(response.data)) {
        results = results.concat(response.data);
      } else {
        return response.data;
      }

      if (response.nextPage) {
        page = parseInt(response.nextPage, 10);
      } else {
        break;
      }
    }
    return results;
  }

  // --- Data Fetching Logic ---

  async function fetchCohortData(subgroup, onProgress) {
    const fullGroupPath = subgroup ? `${config.groupPath}/${subgroup}` : config.groupPath;
    onProgress(`Projecten ophalen voor ${fullGroupPath}...`, 5);

    // 1. Get all projects in the subgroup
    const projectsEndpoint = `/groups/${encodeURIComponent(fullGroupPath)}/projects?include_subgroups=false`;
    const projects = await apiFetchAll(projectsEndpoint);

    // 2. Discover students and map repos
    const studentMap = {}; // studentId -> { studentId, repos: Record<prefix, project> }

    for (const project of projects) {
      for (const repoConfig of config.repos) {
        const studentId = extractStudentIdentifier(project.path, repoConfig.prefix);
        if (studentId) {
          if (!studentMap[studentId]) {
            studentMap[studentId] = { studentId, repos: {} };
          }
          studentMap[studentId].repos[repoConfig.prefix] = project;
          break;
        }
      }
    }

    const studentIds = Object.keys(studentMap).sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
    const totalStudents = studentIds.length;
    const studentResults = {};

    let completedStudents = 0;

    for (const studentId of studentIds) {
      onProgress(`Student ophalen: ${studentId} (${completedStudents + 1} van ${totalStudents})...`,
        10 + Math.round((completedStudents / totalStudents) * 85));

      const studentRepos = await fetchStudentRepos(studentMap[studentId]);
      studentResults[studentId] = {
        studentId,
        repos: studentRepos,
        lastUpdated: new Date().toISOString(),
      };
      completedStudents++;
    }

    onProgress("Gegevens verwerken...", 98);

    const result = {
      version: 1,
      timestamp: new Date().toISOString(),
      students: studentResults,
    };

    saveCachedData(subgroup, result);
    return result;
  }

  async function fetchStudentRepos(studentEntry) {
    const repoResults = [];

    for (const repoConfig of config.repos) {
      const project = studentEntry.repos[repoConfig.prefix];
      if (!project) {
        repoResults.push({
          prefix: repoConfig.prefix,
          label: repoConfig.label,
          exists: false,
          workItems: [],
        });
        continue;
      }

      try {
        // Fetch commits for this project to associate with work items
        let commits = [];
        try {
          commits = await apiFetchAll(`/projects/${project.id}/repository/commits`);
        } catch (e) {
          console.warn(`Kon commits niet ophalen voor project ${project.path}:`, e);
        }

        // Fetch issues/work items
        const issues = await apiFetchAll(`/projects/${project.id}/issues`);

        const workItems = [];
        for (const issue of issues) {
          // Check student commits linking to this issue (#iid)
          const studentCommits = commits.filter((c) => {
            const author = c.author_name || c.committer_name || "";
            const isTeacher = isTeacherCommit(author, config.teacherUsernames);
            return !isTeacher && isWorkItemCommit(c.message, issue.iid);
          });

          // Check student comments/notes count
          let studentNotesCount = 0;
          try {
            const notes = await apiFetchAll(`/projects/${project.id}/issues/${issue.iid}/notes`);
            studentNotesCount = notes.filter((n) => {
              if (n.system) return false;
              const author = n.author?.username || n.author?.name || "";
              return !isTeacherCommit(author, config.teacherUsernames);
            }).length;
          } catch (e) {
            console.warn(`Kon notes niet ophalen voor issue #${issue.iid}:`, e);
          }

          // Scoped label status::done / doing / todo
          const statusLabel = (issue.labels || []).find((l) =>
            l.toLowerCase().startsWith("status::") || ["done", "doing", "todo"].includes(l.toLowerCase())
          );

          workItems.push({
            iid: issue.iid,
            title: issue.title,
            webUrl: issue.web_url,
            state: issue.state,
            statusLabel: statusLabel || null,
            dueDate: issue.due_date || issue.milestone?.due_date || null,
            studentCommitsCount: studentCommits.length,
            studentCommentsCount: studentNotesCount,
          });
        }

        // Sort work items by iid
        workItems.sort((a, b) => a.iid - b.iid);

        repoResults.push({
          prefix: repoConfig.prefix,
          label: repoConfig.label,
          exists: true,
          webUrl: project.web_url,
          workItems,
        });
      } catch (repoErr) {
        // Error isolation per repo
        repoResults.push({
          prefix: repoConfig.prefix,
          label: repoConfig.label,
          exists: true,
          error: repoErr.message,
          workItems: [],
        });
      }
    }

    return repoResults;
  }

  async function refreshSingleStudent(studentId) {
    if (!cachedData || !activeSubgroup) return;
    showStatus(`Verversen van student ${studentId}...`, 50);

    try {
      const fullGroupPath = activeSubgroup ? `${config.groupPath}/${activeSubgroup}` : config.groupPath;
      const projects = await apiFetchAll(`/groups/${encodeURIComponent(fullGroupPath)}/projects?include_subgroups=false`);

      const studentEntry = { studentId, repos: {} };
      for (const project of projects) {
        for (const repoConfig of config.repos) {
          const matchedStudentId = extractStudentIdentifier(project.path, repoConfig.prefix);
          if (matchedStudentId === studentId) {
            studentEntry.repos[repoConfig.prefix] = project;
            break;
          }
        }
      }

      const repos = await fetchStudentRepos(studentEntry);
      cachedData.students[studentId] = {
        studentId,
        repos,
        lastUpdated: new Date().toISOString(),
      };

      saveCachedData(activeSubgroup, cachedData);
      renderDashboard(cachedData);
      hideStatus();
    } catch (err) {
      showError(`Fout bij verversen van student ${studentId}: ${err.message}`);
      hideStatus();
    }
  }

  // --- UI Rendering ---

  function renderDashboard(data) {
    const container = document.getElementById("dashboard-container");
    if (!container) return;

    if (!data || !data.students || Object.keys(data.students).length === 0) {
      container.innerHTML = `<p class="empty-state">Geen studenten gevonden in subgroep '${activeSubgroup}'. Klik op 'Haal status uit GitLab' om gegevens op te halen.</p>`;
      return;
    }

    const studentIds = Object.keys(data.students).sort((a, b) => a.localeCompare(b, "nl", { sensitivity: "base" }));
    let html = "";

    for (const studentId of studentIds) {
      const student = data.students[studentId];
      html += `
        <article class="student-card" id="student-${escapeHtml(studentId)}">
          <header class="student-header">
            <h2 class="student-title">
              <span aria-hidden="true">👤</span>
              <span>${escapeHtml(studentId)}</span>
            </h2>
            <button type="button" class="btn btn-secondary btn-sm btn-refresh-student" data-student="${escapeHtml(studentId)}">
              🔄 Ververs deze student
            </button>
          </header>
          <div class="student-repos">
      `;

      for (const repo of student.repos || []) {
        if (!repo.exists) {
          html += `
            <div class="repo-details repo-missing">
              <div class="repo-summary" style="opacity: 0.6;">
                <div class="repo-summary-left">
                  <span class="badge badge-gray"><span class="badge-dot"></span> Niet gestart</span>
                  <span class="repo-title">${escapeHtml(repo.label)}</span>
                </div>
                <div class="repo-summary-right">
                  <span class="work-item-meta">Repo niet aangemaakt</span>
                </div>
              </div>
            </div>
          `;
          continue;
        }

        if (repo.error) {
          html += `
            <div class="repo-details repo-error">
              <div class="repo-summary">
                <div class="repo-summary-left">
                  <span class="badge badge-red"><span class="badge-dot"></span> Fout</span>
                  <span class="repo-title">${escapeHtml(repo.label)}</span>
                </div>
                <div class="repo-summary-right">
                  <span class="work-item-meta" style="color: var(--color-danger);">${escapeHtml(repo.error)}</span>
                </div>
              </div>
            </div>
          `;
          continue;
        }

        const stoplight = evaluateRepoStoplight(
          repo.workItems,
          currentOrangeThreshold,
          currentRedThreshold,
          currentRequireComments
        );

        const badgeClass = `badge-${stoplight.color}`;
        const colorLabel = stoplight.color === "green" ? "Groen" :
          stoplight.color === "orange" ? "Oranje" :
          stoplight.color === "red" ? "Rood" : "Grijs";

        html += `
          <details class="repo-details" data-repo-prefix="${escapeHtml(repo.prefix)}">
            <summary class="repo-summary">
              <div class="repo-summary-left">
                <span class="badge ${badgeClass} repo-badge" data-repo-prefix="${escapeHtml(repo.prefix)}">
                  <span class="badge-dot"></span> ${colorLabel}
                </span>
                <span class="repo-title">
                  ${repo.webUrl ? `<a href="${escapeHtml(repo.webUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(repo.label)}</a>` : escapeHtml(repo.label)}
                </span>
              </div>
              <div class="repo-summary-right">
                <span class="work-item-meta repo-stat-text">${stoplight.scorableWorkItems} scoorbaar (${stoplight.totalWorkItems} totaal)</span>
              </div>
            </summary>
            <div class="work-item-list">
        `;

        if (!repo.workItems || repo.workItems.length === 0) {
          html += `<div class="repo-empty-note">Geen work items gevonden in deze repo.</div>`;
        } else {
          for (const item of repo.workItems) {
            const itemEval = evaluateWorkItem(item, currentRequireComments);
            const itemBadgeClass = `badge-${itemEval.color}`;
            const itemColorLabel = itemEval.color === "green" ? "Groen" :
              itemEval.color === "orange" ? "Oranje" :
              itemEval.color === "red" ? "Rood" : "Grijs";

            html += `
              <div class="work-item-card" data-item-iid="${item.iid}">
                <div class="work-item-main">
                  <span class="badge ${itemBadgeClass} item-badge">
                    <span class="badge-dot"></span> ${itemColorLabel}
                  </span>
                  <a class="work-item-link" href="${escapeHtml(item.webUrl || '#')}" target="_blank" rel="noopener noreferrer">
                    #${item.iid}: ${escapeHtml(item.title)}
                  </a>
                  <span class="work-item-reason item-reason">(${escapeHtml(itemEval.reason)})</span>
                </div>
                <div class="work-item-meta">
                  <span>${item.studentCommitsCount} commit(s)</span>
                  <span>•</span>
                  <span>${item.studentCommentsCount} reactie(s)</span>
                </div>
              </div>
            `;
          }
        }

        html += `
            </div>
          </details>
        `;
      }

      html += `
          </div>
        </article>
      `;
    }

    container.innerHTML = html;

    // Attach listeners to student refresh buttons
    container.querySelectorAll(".btn-refresh-student").forEach((btn) => {
      btn.addEventListener("click", () => {
        const studentId = btn.getAttribute("data-student");
        if (studentId) {
          refreshSingleStudent(studentId);
        }
      });
    });
  }

  function reevaluateDomColors() {
    if (!cachedData || !cachedData.students) return;

    // Fast in-place DOM updates for slider adjustments without re-rendering entire structure
    for (const [studentId, student] of Object.entries(cachedData.students)) {
      const studentEl = document.getElementById(`student-${studentId}`);
      if (!studentEl) continue;

      for (const repo of student.repos || []) {
        if (!repo.exists || repo.error) continue;

        const repoDetails = studentEl.querySelector(`details[data-repo-prefix="${repo.prefix}"]`);
        if (!repoDetails) continue;

        const stoplight = evaluateRepoStoplight(
          repo.workItems,
          currentOrangeThreshold,
          currentRedThreshold,
          currentRequireComments
        );

        const repoBadge = repoDetails.querySelector(".repo-badge");
        if (repoBadge) {
          repoBadge.className = `badge badge-${stoplight.color} repo-badge`;
          const colorLabel = stoplight.color === "green" ? "Groen" :
            stoplight.color === "orange" ? "Oranje" :
            stoplight.color === "red" ? "Rood" : "Grijs";
          repoBadge.innerHTML = `<span class="badge-dot"></span> ${colorLabel}`;
        }

        // Update items in this repo if comment requirement changed
        const itemCards = repoDetails.querySelectorAll(".work-item-card");
        itemCards.forEach((card) => {
          const iid = parseInt(card.getAttribute("data-item-iid"), 10);
          const item = repo.workItems.find((w) => w.iid === iid);
          if (!item) return;

          const itemEval = evaluateWorkItem(item, currentRequireComments);
          const itemBadge = card.querySelector(".item-badge");
          const itemReason = card.querySelector(".item-reason");

          if (itemBadge) {
            itemBadge.className = `badge badge-${itemEval.color} item-badge`;
            const label = itemEval.color === "green" ? "Groen" :
              itemEval.color === "orange" ? "Oranje" :
              itemEval.color === "red" ? "Rood" : "Grijs";
            itemBadge.innerHTML = `<span class="badge-dot"></span> ${label}`;
          }

          if (itemReason) {
            itemReason.textContent = `(${itemEval.reason})`;
          }
        });
      }
    }
  }

  function updateTimestampDisplay(timestamp) {
    const el = document.getElementById("cache-timestamp");
    const fetchBtn = document.getElementById("btn-fetch-all");
    if (!el) return;

    if (timestamp) {
      el.textContent = `Status van ${formatDateTime(timestamp)}`;
      if (fetchBtn) fetchBtn.textContent = "Ververs status uit GitLab";
    } else {
      el.textContent = "Status: nog niet opgehaald";
      if (fetchBtn) fetchBtn.textContent = "Haal status uit GitLab";
    }
  }

  function showStatus(message, progressPercent) {
    const container = document.getElementById("status-container");
    const msg = document.getElementById("status-message");
    const prog = document.getElementById("progress-bar");
    const buttons = document.querySelectorAll("button, select, input[type='range']");

    if (container) container.style.display = "flex";
    if (msg) msg.textContent = message;
    if (prog) {
      if (typeof progressPercent === "number") {
        prog.style.display = "block";
        prog.value = progressPercent;
      } else {
        prog.style.display = "none";
      }
    }
    buttons.forEach((b) => (b.disabled = true));
  }

  function hideStatus() {
    const container = document.getElementById("status-container");
    const buttons = document.querySelectorAll("button, select, input[type='range']");
    if (container) container.style.display = "none";
    buttons.forEach((b) => (b.disabled = false));
    updateAuthButtons();
  }

  function showError(message) {
    const banner = document.getElementById("error-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = "block";
  }

  function clearError() {
    const banner = document.getElementById("error-banner");
    if (!banner) return;
    banner.style.display = "none";
    banner.textContent = "";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function updateAuthButtons() {
    const fetchBtn = document.getElementById("btn-fetch-all");
    const tokenInput = document.getElementById("gitlab-token");
    const saveBtn = document.getElementById("btn-save-token");

    if (sessionToken) {
      if (fetchBtn) fetchBtn.disabled = false;
      if (saveBtn) saveBtn.textContent = "Token actief in sessie ✓";
    } else {
      if (fetchBtn) fetchBtn.disabled = true;
      if (saveBtn) saveBtn.textContent = "Bewaar in sessie";
    }
  }

  // --- Initialization ---

  function init() {
    // 1. Read embedded config from JSON script tag
    const configEl = document.getElementById("bso-dashboard-config");
    if (configEl && configEl.textContent) {
      try {
        const parsed = JSON.parse(configEl.textContent.trim());
        config = Object.assign(config, parsed);
      } catch (e) {
        console.warn("Kon embedded configuratie niet parsen:", e);
      }
    }

    currentOrangeThreshold = config.orangeThresholdPercent ?? 10;
    currentRedThreshold = config.redThresholdPercent ?? 50;
    currentRequireComments = config.requireCommentsForDone ?? false;

    // Set hidden username for browser password manager
    const usernameInput = document.getElementById("username");
    if (usernameInput) {
      usernameInput.value = `gitlab-token@${config.gitlabUrl.replace(/^https?:\/\//, "")}`;
    }

    // 2. Populate subgroup select
    const subgroupSelect = document.getElementById("subgroup-select");
    if (subgroupSelect) {
      subgroupSelect.innerHTML = "";
      if (config.subgroups && config.subgroups.length > 0) {
        for (const sub of config.subgroups) {
          const opt = document.createElement("option");
          opt.value = sub;
          opt.textContent = sub;
          subgroupSelect.appendChild(opt);
        }
        activeSubgroup = config.subgroups[0];
      } else {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "(Standaard)";
        subgroupSelect.appendChild(opt);
        activeSubgroup = "";
      }

      subgroupSelect.addEventListener("change", (e) => {
        activeSubgroup = e.target.value;
        loadCohortFromCache();
      });
    }

    // 3. Initialize sliders & settings
    const sliderOrange = document.getElementById("slider-orange");
    const sliderRed = document.getElementById("slider-red");
    const valOrange = document.getElementById("val-orange");
    const valRed = document.getElementById("val-red");
    const checkRequireComments = document.getElementById("check-require-comments");
    const btnResetSettings = document.getElementById("btn-reset-settings");

    if (sliderOrange && valOrange) {
      sliderOrange.value = currentOrangeThreshold;
      valOrange.textContent = currentOrangeThreshold;
      sliderOrange.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        currentOrangeThreshold = val;
        valOrange.textContent = val;
        reevaluateDomColors();
      });
    }

    if (sliderRed && valRed) {
      sliderRed.value = currentRedThreshold;
      valRed.textContent = currentRedThreshold;
      sliderRed.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        currentRedThreshold = val;
        valRed.textContent = val;
        reevaluateDomColors();
      });
    }

    if (checkRequireComments) {
      checkRequireComments.checked = currentRequireComments;
      checkRequireComments.addEventListener("change", (e) => {
        currentRequireComments = e.target.checked;
        reevaluateDomColors();
      });
    }

    if (btnResetSettings) {
      btnResetSettings.addEventListener("click", () => {
        currentOrangeThreshold = config.orangeThresholdPercent ?? 10;
        currentRedThreshold = config.redThresholdPercent ?? 50;
        currentRequireComments = config.requireCommentsForDone ?? false;

        if (sliderOrange) sliderOrange.value = currentOrangeThreshold;
        if (valOrange) valOrange.textContent = currentOrangeThreshold;
        if (sliderRed) sliderRed.value = currentRedThreshold;
        if (valRed) valRed.textContent = currentRedThreshold;
        if (checkRequireComments) checkRequireComments.checked = currentRequireComments;

        reevaluateDomColors();
      });
    }

    // 4. Token form handler
    const tokenForm = document.getElementById("token-form");
    const tokenInput = document.getElementById("gitlab-token");
    const btnForgetToken = document.getElementById("btn-forget-token");

    if (tokenForm) {
      tokenForm.addEventListener("submit", (e) => {
        e.preventDefault();
        sessionToken = (tokenInput?.value || "").trim();
        updateAuthButtons();
        clearError();
      });
    }

    if (btnForgetToken) {
      btnForgetToken.addEventListener("click", () => {
        sessionToken = "";
        if (tokenInput) tokenInput.value = "";
        updateAuthButtons();
        alert(
          "Het token is gewist uit het browsergeheugen van deze pagina.\n\n" +
          "Als uw browser het token in zijn wachtwoordmanager heeft opgeslagen, " +
          "kunt u dit naar wens verwijderen via de browserinstellingen."
        );
      });
    }

    // 5. Fetch all & Clear cache handlers
    const btnFetchAll = document.getElementById("btn-fetch-all");
    const btnClearCache = document.getElementById("btn-clear-cache");

    if (btnFetchAll) {
      btnFetchAll.addEventListener("click", async () => {
        if (!sessionToken) {
          showError("Voer eerst een geldig GitLab Group Access Token in.");
          return;
        }
        clearError();
        showStatus("Initialiseren...", 0);
        try {
          cachedData = await fetchCohortData(activeSubgroup, (msg, pct) => showStatus(msg, pct));
          renderDashboard(cachedData);
          updateTimestampDisplay(cachedData.timestamp);
        } catch (err) {
          showError(`Fout bij ophalen van gegevens: ${err.message}`);
        } finally {
          hideStatus();
        }
      });
    }

    if (btnClearCache) {
      btnClearCache.addEventListener("click", () => {
        if (confirm(`Weet u zeker dat u de gecachte studentgegevens voor '${activeSubgroup}' wilt wissen?`)) {
          clearCachedData(activeSubgroup);
          cachedData = null;
          updateTimestampDisplay(null);
          renderDashboard(null);
        }
      });
    }

    // 6. Initial cache load
    loadCohortFromCache();
    updateAuthButtons();
  }

  function loadCohortFromCache() {
    clearError();
    cachedData = loadCachedData(activeSubgroup);
    if (cachedData) {
      updateTimestampDisplay(cachedData.timestamp);
      renderDashboard(cachedData);
    } else {
      updateTimestampDisplay(null);
      renderDashboard(null);
    }
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
