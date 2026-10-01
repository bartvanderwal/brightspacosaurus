// Brightspacosaurus Voortgangsverkenner (teacher progress dashboard, #37)
//
// React 18 + htm, loaded from vendor/ (no CDN, no build step). Calculation
// rules live in calc.js. The token and all fetched data stay in memory; the
// page writes nothing to cookies or web storage.

(function () {
  "use strict";

  const { useState, useMemo, useCallback, useEffect, useRef } = React;
  const html = htm.bind(React.createElement);
  const calc = globalThis.bsoDashboardCalc;

  // --- Configuration (embedded by BSO prepare) ---

  function readConfig() {
    const defaults = {
      gitlabUrl: "https://gitlab.com",
      groupPath: "",
      subgroups: [],
      repos: [],
      teacherUsernames: [],
      requireCommentsForDone: false,
      orangeThresholdPercent: 10,
      redThresholdPercent: 50,
    };
    const el = document.getElementById("bso-dashboard-config");
    try {
      return Object.assign(defaults, JSON.parse((el && el.textContent || "{}").trim()));
    } catch (e) {
      console.warn("Kon embedded configuratie niet lezen:", e);
      return defaults;
    }
  }

  const config = readConfig();
  const apiBase = `${config.gitlabUrl.replace(/\/+$/, "")}/api/v4`;
  const MAX_PARALLEL = 6;

  // --- GitLab API client ---

  class GitLabError extends Error {
    constructor(status, body) {
      super(friendlyError(status, body));
      this.status = status;
      this.details = body;
    }
  }

  /** Short Dutch message; the raw GitLab response stays available as details. */
  function friendlyError(status, body) {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // not JSON
    }
    if (status === 401) return "Token ongeldig of verlopen (401).";
    if (status === 403 && parsed && parsed.error === "insufficient_granular_scope") {
      return "Token mist leesrechten voor deze repo (403). Zie de handleiding: Project Planning, Repository en Groups.";
    }
    if (status === 403) return "Geen toegang tot deze repo (403).";
    if (status === 404) return "Niet gevonden (404).";
    if (status === 429) return "Te veel verzoeken aan GitLab (429). Probeer het zo opnieuw.";
    return `GitLab gaf fout ${status}.`;
  }

  async function apiGetAll(token, endpoint) {
    let results = [];
    let page = "1";
    while (page) {
      const sep = endpoint.includes("?") ? "&" : "?";
      const res = await fetch(`${apiBase}${endpoint}${sep}per_page=100&page=${page}`, {
        headers: { "PRIVATE-TOKEN": token },
      });
      if (!res.ok) throw new GitLabError(res.status, await res.text().catch(() => ""));
      const data = await res.json();
      if (!Array.isArray(data)) return data;
      results = results.concat(data);
      page = (res.headers.get("x-next-page") || "").trim();
    }
    return results;
  }

  /** Runs fn over items with at most `limit` calls in flight. */
  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  /** GitLab commits carry names and e-mail addresses, not usernames. */
  function isTeacherAuthor(name, email) {
    const emailUser = (email || "").split("@")[0];
    return calc.isTeacherCommit(name, emailUser, config.teacherUsernames);
  }

  function toCommit(c) {
    return {
      id: c.id,
      shortId: c.short_id,
      title: c.title,
      author: c.author_name,
      date: c.committed_date || c.created_at,
      webUrl: c.web_url,
      byTeacher: isTeacherAuthor(c.author_name, c.author_email),
    };
  }

  // --- Data fetching ---

  function groupPath(subgroup) {
    return subgroup ? `${config.groupPath}/${subgroup}` : config.groupPath;
  }

  /**
   * Light trial call when a token is entered: lists the subgroups (classes) of
   * the course group. A failure means the token is mistyped, expired or lacks
   * Group: Read, so the page rejects it.
   */
  async function checkTokenAndListClasses(token) {
    try {
      const groups = await apiGetAll(token, `/groups/${encodeURIComponent(config.groupPath)}/subgroups`);
      const wanted = config.subgroups.map((s) => s.toLowerCase());
      const classes = groups
        .map((g) => g.path)
        .filter((path) => !wanted.length || wanted.includes(path.toLowerCase()))
        .sort((a, b) => a.localeCompare(b, "nl"));
      return classes.length ? classes : [""];
    } catch (e) {
      if (e.status === 401) throw new Error("Token geweigerd: ongeldig, verkeerd geplakt of verlopen (401).");
      if (e.status === 403) {
        throw new Error(`Token geweigerd: geen leesrecht op groep ${config.groupPath} (403). Geef het token "Group: Read".`);
      }
      if (e.status === 404) {
        throw new Error(`Token geweigerd: groep ${config.groupPath} niet gevonden, of het token heeft er geen toegang toe (404).`);
      }
      throw new Error(`Token kon niet gecontroleerd worden: ${e.message || e}`);
    }
  }

  async function discoverStudents(token, subgroup) {
    const projects = await apiGetAll(
      token,
      `/groups/${encodeURIComponent(groupPath(subgroup))}/projects?include_subgroups=false`,
    );
    const students = {};
    for (const project of projects) {
      for (const repo of config.repos) {
        const studentId = calc.extractStudentIdentifier(project.path, repo.prefix);
        if (studentId) {
          (students[studentId] ||= { studentId, projects: {} }).projects[repo.prefix] = project;
          break;
        }
      }
    }
    return students;
  }

  async function fetchWorkItem(token, project, issue, repoCommits) {
    const base = `/projects/${project.id}/issues/${issue.iid}`;
    const [notes, mergeRequests] = await Promise.all([
      apiGetAll(token, `${base}/notes`).catch(() => []),
      apiGetAll(token, `${base}/related_merge_requests`).catch(() => []),
    ]);

    const linked = new Map();
    for (const c of repoCommits) {
      if (calc.isWorkItemCommit(c.message || "", issue.iid)) linked.set(c.id, toCommit(c));
    }
    const mrs = [];
    for (const mr of mergeRequests) {
      const mrCommits = await apiGetAll(token, `/projects/${mr.project_id}/merge_requests/${mr.iid}/commits`)
        .catch(() => []);
      for (const c of mrCommits) linked.set(c.id, toCommit(c));
      mrs.push({ iid: mr.iid, title: mr.title, state: mr.state, webUrl: mr.web_url });
    }

    const commits = [...linked.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const statusLabel = (issue.labels || []).find((l) => {
      const lower = l.toLowerCase();
      return lower.startsWith("status::") || ["done", "doing", "todo"].includes(lower);
    }) || null;

    return {
      iid: issue.iid,
      title: issue.title,
      webUrl: issue.web_url,
      state: issue.state,
      statusLabel,
      dueDate: issue.due_date || (issue.milestone && issue.milestone.due_date) || null,
      studentCommitsCount: commits.filter((c) => !c.byTeacher).length,
      studentCommentsCount: notes.filter((n) =>
        !n.system && !calc.isTeacherCommit(n.author && n.author.username, n.author && n.author.name, config.teacherUsernames)
      ).length,
      commits,
      mergeRequests: mrs,
    };
  }

  async function fetchRepo(token, repo, project) {
    if (!project) return { prefix: repo.prefix, label: repo.label, exists: false, workItems: [] };
    try {
      let warning = "";
      const [repoCommits, issues] = await Promise.all([
        apiGetAll(token, `/projects/${project.id}/repository/commits?all=true`).catch((e) => {
          warning = `Commits niet opgehaald: ${e.message} Zonder commits kleurt afgerond werk oranje.`;
          return [];
        }),
        apiGetAll(token, `/projects/${project.id}/issues`),
      ]);
      const workItems = await mapLimit(issues, MAX_PARALLEL, (issue) =>
        fetchWorkItem(token, project, issue, repoCommits)
      );
      workItems.sort((a, b) => a.iid - b.iid);
      return { prefix: repo.prefix, label: repo.label, exists: true, webUrl: project.web_url, workItems, warning };
    } catch (e) {
      return {
        prefix: repo.prefix,
        label: repo.label,
        exists: true,
        error: e.message,
        errorDetails: e.details || "",
        workItems: [],
      };
    }
  }

  async function fetchStudent(token, entry) {
    const repos = await Promise.all(config.repos.map((repo) => fetchRepo(token, repo, entry.projects[repo.prefix])));
    return { studentId: entry.studentId, repos, fetchedAt: new Date().toISOString() };
  }

  // --- Stoplight evaluation (rules from calc.js, thresholds from settings) ---

  const LIGHT = {
    ok: { cls: "ok", sym: "✓", text: "Groen" },
    warn: { cls: "warn", sym: "!", text: "Oranje" },
    bad: { cls: "bad", sym: "✕", text: "Rood" },
    idle: { cls: "idle", sym: "–", text: "Nog niet" },
  };
  const FROM_CALC = { green: "ok", orange: "warn", red: "bad", gray: "idle" };

  function classifyItem(item, settings) {
    const ev = calc.evaluateWorkItem({ ...item, requireCommentsForDone: settings.requireComments });
    return { light: FROM_CALC[ev.color], reason: ev.reason, ev };
  }

  /** Aggregate over work items: light, counts and scorable total. */
  function aggregate(items, settings) {
    const agg = calc.evaluateRepoStoplight(
      items.map((it) => classifyItem(it, settings).ev),
      settings.orange,
      settings.red,
    );
    return {
      light: FROM_CALC[agg.color],
      n: { ok: agg.greenCount, warn: agg.orangeCount, bad: agg.redCount },
      total: agg.scorableWorkItems,
      idle: agg.neutralCount,
      share: agg.incompletePercent / 100,
      reason: agg.reason,
    };
  }

  function repoAggregate(repo, settings) {
    if (!repo.exists) return { light: "idle", n: { ok: 0, warn: 0, bad: 0 }, total: 0, idle: 0, reason: "Repo niet aangemaakt" };
    if (repo.error) return { light: "bad", n: { ok: 0, warn: 0, bad: 0 }, total: 0, idle: 0, reason: repo.error };
    return aggregate(repo.workItems, settings);
  }

  const visibleRepos = (s, visible) => s.repos.filter((r) => visible.has(r.prefix));
  const studentItems = (s, visible) => visibleRepos(s, visible).flatMap((r) => r.workItems);

  function studentAggregate(s, visible, settings) {
    const repos = visibleRepos(s, visible);
    if (repos.some((r) => r.error)) {
      const items = aggregate(studentItems(s, visible), settings);
      return { ...items, light: "bad", reason: "Fout bij ophalen van een repo" };
    }
    return aggregate(studentItems(s, visible), settings);
  }

  // --- Formatting ---

  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  function fmtDate(iso) {
    if (!iso) return "geen";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function fmtDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" }) + " " +
      d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }

  function Light({ l, label }) {
    const x = LIGHT[l];
    return html`<span className=${"light " + x.cls} data-sym=${x.sym}
      aria-label=${"Stoplicht " + x.text + (label ? ": " + label : "")}>${label || x.text}</span>`;
  }
  function Dot({ l }) {
    return html`<span className=${"dot " + l} aria-hidden="true"></span>`;
  }
  function Stack({ n, total }) {
    if (!total) return html`<div className="stack" aria-hidden="true"></div>`;
    const w = (x) => ({ width: (x / total) * 100 + "%" });
    return html`<div className="stack" role="img" aria-label=${`${n.ok} groen, ${n.warn} oranje, ${n.bad} rood van ${total}`}>
      <span className="ok" style=${w(n.ok)}></span><span className="warn" style=${w(n.warn)}></span><span className="bad" style=${w(n.bad)}></span></div>`;
  }
  function Ext({ href, children }) {
    return html`<a href=${href} target="_blank" rel="noopener noreferrer">${children} ↗</a>`;
  }

  // --- Tree ---

  function buildTree(students, klas, visible, settings, filter, query) {
    const q = query.trim().toLowerCase();
    const node = (id, type, label, light, meta, data, children) => ({ id, type, label, light, meta, data, children });
    const attention = (l) => !["ok", "idle"].includes(l);
    const kids = students.filter((s) => !q || s.studentId.toLowerCase().includes(q)).map((s) => {
      const agg = studentAggregate(s, visible, settings);
      const repos = visibleRepos(s, visible).map((repo) => {
        const ragg = repoAggregate(repo, settings);
        const items = repo.workItems
          .map((it) => ({ it, cl: classifyItem(it, settings) }))
          .filter(({ cl }) => !filter || attention(cl.light))
          .map(({ it, cl }) => {
            const commits = it.commits.map((c) =>
              node(`${s.studentId}/${repo.prefix}/${it.iid}/${c.id}`, "commit", c.title, null, c.shortId, { student: s, repo, item: it, commit: c }, [])
            );
            return node(`${s.studentId}/${repo.prefix}/${it.iid}`, "item", `#${it.iid} ${it.title}`, cl.light,
              it.commits.length ? `${it.commits.length} commit${it.commits.length > 1 ? "s" : ""}` : (it.statusLabel || it.state),
              { student: s, repo, item: it }, commits);
          });
        const meta = !repo.exists ? "geen repo" : repo.error ? "fout" : `${ragg.n.ok}/${ragg.total}`;
        return node(`${s.studentId}/${repo.prefix}`, "repo", repo.label, ragg.light, meta, { student: s, repo }, items);
      }).filter((r) => !filter || attention(r.light));
      return node(s.studentId, "student", s.studentId, agg.light, `${agg.n.ok}/${agg.total}`, { student: s }, repos);
    }).filter((s) => !filter || attention(s.light));
    return node(`klas/${klas}`, "klas", klas || config.groupPath, null, `${kids.length} studenten`, { klas }, kids);
  }

  function flatten(root, open) {
    const out = [];
    (function walk(n, depth, parent) {
      out.push({ n, depth, parent });
      if (open.has(n.id)) n.children.forEach((c) => walk(c, depth + 1, n));
    })(root, 0, null);
    return out;
  }

  function findPath(root, id) {
    const path = [];
    (function walk(n) {
      path.push(n);
      if (n.id === id) return true;
      for (const c of n.children) if (walk(c)) return true;
      path.pop();
      return false;
    })(root);
    return path;
  }

  function Tree({ root, open, setOpen, selected, select }) {
    const rows = flatten(root, open);
    const ref = useRef(null);
    const toggle = (id) => setOpen((o) => {
      const x = new Set(o);
      x.has(id) ? x.delete(id) : x.add(id);
      return x;
    });
    const onKey = (e) => {
      const i = rows.findIndex((r) => r.n.id === selected);
      const cur = rows[i];
      if (!cur) return;
      const go = (j) => {
        if (rows[j]) {
          e.preventDefault();
          select(rows[j].n.id);
        }
      };
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i - 1);
      else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (cur.n.children.length && !open.has(cur.n.id)) toggle(cur.n.id);
        else go(i + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (open.has(cur.n.id)) toggle(cur.n.id);
        else if (cur.parent) select(cur.parent.id);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (cur.n.children.length) toggle(cur.n.id);
      }
    };
    useEffect(() => {
      const el = ref.current && ref.current.querySelector('[aria-selected="true"]');
      if (el) el.scrollIntoView({ block: "nearest" });
    }, [selected]);
    return html`<ul className="tree" role="tree" aria-label="Klas, studenten, repo's, work items en commits" tabIndex="0"
        ref=${ref} onKeyDown=${onKey} aria-activedescendant=${"t-" + slug(selected)}>
      ${rows.map(({ n, depth }) => html`<li key=${n.id} id=${"t-" + slug(n.id)} role="treeitem" aria-level=${depth + 1}
          aria-expanded=${n.children.length ? open.has(n.id) : undefined} aria-selected=${n.id === selected}
          className="row" style=${{ "--depth": depth }}
          onClick=${() => {
            select(n.id);
            if (n.children.length && n.id !== selected) setOpen((o) => new Set(o).add(n.id));
          }}>
        <span className="twisty" onClick=${(e) => {
          e.stopPropagation();
          if (n.children.length) toggle(n.id);
        }}>${n.children.length ? (open.has(n.id) ? "▾" : "▸") : ""}</span>
        ${n.light ? html`<${Dot} l=${n.light} />` : null}
        <span className=${"name" + (n.type === "commit" ? " mono" : "")}>${n.type === "commit" ? n.meta + "  " + n.label : n.label}</span>
        ${n.type !== "commit" ? html`<span className="meta">${n.meta}</span>` : null}
      </li>`)}
    </ul>`;
  }

  // --- Detail views ---

  function KlasDetail({ klas, students, visible, settings, onPick }) {
    const repos = config.repos.filter((r) => visible.has(r.prefix));
    const all = students.map((s) => ({
      s,
      agg: studentAggregate(s, visible, settings),
      repos: repos.map((cfg) => repoAggregate(s.repos.find((r) => r.prefix === cfg.prefix), settings)),
    }));
    const counts = { ok: 0, warn: 0, bad: 0, idle: 0 };
    all.forEach((x) => counts[x.agg.light]++);
    return html`<div className="detail">
      <div className="dhead"><h2>Klas ${klas || config.groupPath}</h2>
        <span className="muted">${students.length} studenten · ${repos.length} van ${config.repos.length} repo's getoond</span></div>
      <div className="facts">
        <div className="fact"><span className="label">Op schema</span><b className="add">${counts.ok}</b></div>
        <div className="fact"><span className="label">Aandacht nodig</span><b style=${{ color: "var(--warn)" }}>${counts.warn}</b></div>
        <div className="fact"><span className="label">Achter</span><b className="del">${counts.bad}</b></div>
      </div>
      <div className="scroll"><table>
        <thead><tr><th>Student</th><th>Totaal</th>${repos.map((r) => html`<th key=${r.prefix}>${r.label}</th>`)}<th>Verdeling</th></tr></thead>
        <tbody>${all.map(({ s, agg, repos: ras }) => html`<tr key=${s.studentId} className="click" onClick=${() => onPick(s.studentId)}>
          <td><strong>${s.studentId}</strong></td>
          <td><${Light} l=${agg.light} /></td>
          ${ras.map((a, i) => html`<td key=${i} title=${a.reason}><${Light} l=${a.light}
            label=${a.reason === "Repo niet aangemaakt" ? "geen repo" : a.total ? `${a.n.ok}/${a.total}` : "–"} /></td>`)}
          <td><${Stack} n=${agg.n} total=${agg.total} /></td></tr>`)}</tbody>
      </table></div>
    </div>`;
  }

  function lastOwnCommit(items) {
    return items.flatMap((i) => i.commits).filter((c) => !c.byTeacher)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  }

  function StudentDetail({ s, visible, settings, onPick, onRefresh, busy }) {
    const agg = studentAggregate(s, visible, settings);
    const last = lastOwnCommit(studentItems(s, visible));
    return html`<div className="detail">
      <div className="dhead"><h2>${s.studentId}</h2><${Light} l=${agg.light} />
        <button className="btn" style=${{ marginLeft: "auto" }} disabled=${busy} onClick=${() => onRefresh(s.studentId)}>Ververs deze student</button></div>
      <div className="facts">
        <div className="fact"><span className="label">Groen</span><b className="add">${agg.n.ok}<span className="muted" style=${{ fontSize: "var(--step-0)" }}> / ${agg.total}</span></b></div>
        <div className="fact"><span className="label">Oranje</span><b style=${{ color: "var(--warn)" }}>${agg.n.warn}</b></div>
        <div className="fact"><span className="label">Rood</span><b className="del">${agg.n.bad}</b></div>
        <div className="fact"><span className="label">Laatste eigen commit</span><b style=${{ fontSize: "var(--step-1)" }}>${last ? fmtDateTime(last.date) : "geen"}</b></div>
      </div>
      <div className="scroll"><table>
        <thead><tr><th>Repo</th><th>Stoplicht</th><th className="num">Groen</th><th className="num">Oranje</th><th className="num">Rood</th><th className="num">Nog niet</th><th>Verdeling</th></tr></thead>
        <tbody>${visibleRepos(s, visible).map((r) => {
          const a = repoAggregate(r, settings);
          return html`<tr key=${r.prefix} className="click" onClick=${() => onPick(`${s.studentId}/${r.prefix}`)}>
            <td><strong>${r.label}</strong>${!r.exists || r.error ? html`<div className="reason">${a.reason}</div>` : null}</td>
            <td><${Light} l=${a.light} /></td><td className="num">${a.n.ok}</td><td className="num">${a.n.warn}</td>
            <td className="num">${a.n.bad}</td><td className="num muted">${a.idle}</td><td><${Stack} n=${a.n} total=${a.total} /></td></tr>`;
        })}</tbody>
      </table></div>
    </div>`;
  }

  function RepoDetail({ s, repo, settings, onPick }) {
    const a = repoAggregate(repo, settings);
    if (!repo.exists || repo.error) {
      return html`<div className="detail">
        <div className="dhead"><h2>${repo.label}</h2><${Light} l=${a.light} /></div>
        <p className="reason" style=${{ margin: 0 }} title=${repo.errorDetails || ""}>${a.reason}</p>
      </div>`;
    }
    return html`<div className="detail">
      <div className="dhead"><h2>${repo.label}</h2><${Light} l=${a.light} />
        <span className="muted">${a.total ? `${Math.round(a.share * 100)}% niet groen` : "nog geen scoorbare work items"}</span></div>
      ${repo.warning ? html`<p className="error" role="alert">${repo.warning}</p>` : null}
      <div className="scroll"><table>
        <thead><tr><th>Work item</th><th>Stoplicht</th><th>Reden</th><th className="num">Commits</th><th className="num">MR's</th><th>Deadline</th></tr></thead>
        <tbody>${repo.workItems.map((it) => {
          const cl = classifyItem(it, settings);
          return html`<tr key=${it.iid} className="click" onClick=${() => onPick(`${s.studentId}/${repo.prefix}/${it.iid}`)}>
            <td><span className="mono muted">#${it.iid}</span> ${it.title}</td><td><${Light} l=${cl.light} /></td>
            <td className="reason">${cl.reason}</td><td className="num">${it.commits.length}</td>
            <td className="num">${it.mergeRequests.length}</td><td className="mono">${fmtDate(it.dueDate)}</td></tr>`;
        })}</tbody>
      </table></div>
    </div>`;
  }

  function CommitCard({ c }) {
    return html`<div className="commit">
      <div className="commit-head"><span className="sha">${c.shortId}</span><strong>${c.title}</strong></div>
      <div className="muted" style=${{ fontSize: "var(--step-0)" }}>${c.byTeacher ? "Docent" : "Student"} ${c.author} · ${c.date ? fmtDateTime(c.date) : ""}${
        c.byTeacher ? " · telt niet mee voor het stoplicht" : ""}</div>
      <div className="links"><${Ext} href=${c.webUrl}>Commit met wijzigingen in GitLab<//></div>
    </div>`;
  }

  function ItemDetail({ item, settings, focus }) {
    const cl = classifyItem(item, settings);
    const commits = focus ? item.commits.filter((c) => c.id === focus) : item.commits;
    return html`<div className="detail">
      <div className="dhead"><h2>#${item.iid} ${item.title}</h2><${Light} l=${cl.light} /></div>
      <div className="facts">
        <div className="fact"><span className="label">Status</span><b style=${{ fontSize: "var(--step-1)" }} className="mono">${item.statusLabel || item.state}</b></div>
        <div className="fact"><span className="label">Deadline</span><b style=${{ fontSize: "var(--step-1)" }} className="mono">${fmtDate(item.dueDate)}</b></div>
        <div className="fact"><span className="label">Opmerkingen</span><b style=${{ fontSize: "var(--step-1)" }}>${item.studentCommentsCount}</b></div>
        <div className="fact"><span className="label">Commits</span><b style=${{ fontSize: "var(--step-1)" }}>${item.commits.length}</b></div>
      </div>
      <p className="reason" style=${{ margin: 0 }}><strong>Waarom deze kleur:</strong> ${cl.reason}.</p>
      <div className="links"><${Ext} href=${item.webUrl}>Work item #${item.iid} in GitLab<//></div>
      ${item.mergeRequests.length ? html`<div className="mrs"><h3>Merge requests</h3>
        <ul>${item.mergeRequests.map((mr) => html`<li key=${mr.iid}><${Ext} href=${`${mr.webUrl}/diffs`}>!${mr.iid} ${mr.title}<//>
          <span className="muted"> · ${mr.state}</span></li>`)}</ul></div>` : null}
      ${commits.length
        ? html`<div style=${{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3>${focus ? "Commit" : "Gekoppelde commits"}</h3>
            ${commits.map((c) => html`<${CommitCard} key=${c.id} c=${c} />`)}</div>`
        : html`<p className="muted" style=${{ margin: 0 }}>Nog geen commits die naar #${item.iid} verwijzen of in een gekoppelde merge request staan.</p>`}
    </div>`;
  }

  // --- Toolbar parts ---

  function TokenField({ token, onAccept, onForget }) {
    const [value, setValue] = useState("");
    const [checking, setChecking] = useState(false);
    const [problem, setProblem] = useState("");
    const host = config.gitlabUrl.replace(/^https?:\/\//, "");
    const submit = async (e) => {
      e.preventDefault();
      const candidate = value.trim();
      if (!candidate) return;
      setChecking(true);
      setProblem("");
      try {
        const classes = await checkTokenAndListClasses(candidate);
        onAccept(candidate, classes);
      } catch (err) {
        setProblem(err.message);
      } finally {
        setChecking(false);
      }
    };
    const forget = () => {
      setValue("");
      setProblem("");
      onForget();
    };
    return html`<form className="field" onSubmit=${submit}>
      <label className="label" htmlFor="token">GitLab-token (alleen lezen)</label>
      <input type="text" name="username" autoComplete="username" value=${"gitlab-token@" + host} readOnly hidden />
      <div className="token-row">
        <input id="token" type="password" autoComplete="current-password"
          placeholder=${token ? "Token geaccepteerd" : "Plak hier je token"}
          value=${token ? "" : value} disabled=${!!token || checking}
          aria-invalid=${problem ? "true" : undefined} aria-describedby=${problem ? "token-problem" : undefined}
          onChange=${(e) => setValue(e.target.value)} />
        ${token
          ? html`<span className="token-ok">Geaccepteerd ✓</span>
              <button type="button" className="btn" onClick=${forget}>Vergeet token</button>`
          : html`<button type="submit" className="btn" disabled=${checking || !value.trim()}>
              ${checking ? "Controleren…" : "Controleer en gebruik"}</button>`}
      </div>
      ${problem ? html`<p id="token-problem" className="error" role="alert">${problem}</p>` : null}
    </form>`;
  }

  function RepoFilter({ visible, setVisible }) {
    const toggle = (prefix) => setVisible((v) => {
      const x = new Set(v);
      x.has(prefix) ? x.delete(prefix) : x.add(prefix);
      return x;
    });
    const all = visible.size === config.repos.length;
    return html`<fieldset className="filter">
      <legend className="label">Toon repo's</legend>
      ${config.repos.map((r) => html`<label key=${r.prefix} className="chip">
        <input type="checkbox" checked=${visible.has(r.prefix)} onChange=${() => toggle(r.prefix)} /> ${r.label}</label>`)}
      <button type="button" className="btn btn-link" onClick=${() => setVisible(new Set(all ? [] : config.repos.map((r) => r.prefix)))}>
        ${all ? "Alles uit" : "Alles aan"}</button>
    </fieldset>`;
  }

  function SettingsPanel({ settings, setSettings }) {
    const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
    return html`<details className="settings">
      <summary className="label">Instellingen stoplicht</summary>
      <div className="settings-body">
        <label>Oranje vanaf <strong>${settings.orange}%</strong> niet-groene work items
          <input type="range" min="0" max="100" value=${settings.orange} onChange=${(e) => set({ orange: Number(e.target.value) })} /></label>
        <label>Rood boven <strong>${settings.red}%</strong> niet-groene work items
          <input type="range" min="0" max="100" value=${settings.red} onChange=${(e) => set({ red: Number(e.target.value) })} /></label>
        <label className="check"><input type="checkbox" checked=${settings.requireComments}
          onChange=${(e) => set({ requireComments: e.target.checked })} /> Groen vereist een opmerking van de student op het work item</label>
        <button type="button" className="btn btn-link" onClick=${() => setSettings(defaultSettings())}>Standaardwaarden uit de configuratie</button>
      </div>
    </details>`;
  }

  function defaultSettings() {
    return {
      orange: config.orangeThresholdPercent,
      red: config.redThresholdPercent,
      requireComments: config.requireCommentsForDone,
    };
  }

  // --- App ---

  function App() {
    const [token, setToken] = useState("");
    const [subgroups, setSubgroups] = useState([]);
    const [klas, setKlas] = useState("");
    const [dataByKlas, setDataByKlas] = useState({});
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState(false);
    const [query, setQuery] = useState("");
    const [visible, setVisible] = useState(() => new Set(config.repos.map((r) => r.prefix)));
    const [settings, setSettings] = useState(defaultSettings);
    const [open, setOpen] = useState(() => new Set(["klas/"]));
    const [selected, setSelected] = useState("klas/");

    const acceptToken = (accepted, classes) => {
      setToken(accepted);
      setSubgroups(classes);
      setKlas(classes[0]);
    };
    const forgetToken = () => {
      setToken("");
      setSubgroups([]);
      setKlas("");
      setDataByKlas({});
    };

    const data = dataByKlas[klas];
    const students = useMemo(() => (data ? Object.values(data.students)
      .sort((a, b) => a.studentId.localeCompare(b.studentId, "nl", { sensitivity: "base" })) : []), [data]);
    const root = useMemo(() => buildTree(students, klas, visible, settings, filter, query),
      [students, klas, visible, settings, filter, query]);

    useEffect(() => {
      setOpen(new Set([`klas/${klas}`]));
      setSelected(`klas/${klas}`);
    }, [klas]);

    const path = findPath(root, selected);
    const node = path.length ? path[path.length - 1] : root;
    const pick = useCallback((id) => {
      const p = findPath(root, id);
      setOpen((o) => {
        const x = new Set(o);
        p.slice(0, -1).forEach((n) => x.add(n.id));
        return x;
      });
      setSelected(id);
    }, [root]);

    async function refreshClass() {
      setError("");
      try {
        setBusy({ text: "Projecten ophalen" });
        const entries = Object.values(await discoverStudents(token, klas));
        const result = {};
        let done = 0;
        setBusy({ done, total: entries.length });
        await mapLimit(entries, 2, async (entry) => {
          result[entry.studentId] = await fetchStudent(token, entry);
          setBusy({ done: ++done, total: entries.length });
        });
        setDataByKlas((prev) => ({ ...prev, [klas]: { students: result, fetchedAt: new Date().toISOString() } }));
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setBusy(null);
      }
    }

    async function refreshStudent(studentId) {
      setError("");
      try {
        setBusy({ text: `${studentId} ophalen` });
        const entry = (await discoverStudents(token, klas))[studentId];
        if (!entry) throw new Error(`Geen repo's meer gevonden voor ${studentId}.`);
        const fresh = await fetchStudent(token, entry);
        setDataByKlas((prev) => ({
          ...prev,
          [klas]: { ...prev[klas], students: { ...prev[klas].students, [studentId]: fresh } },
        }));
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setBusy(null);
      }
    }

    const d = node.data || {};
    let detail;
    if (!data) {
      detail = html`<div className="empty">${token
        ? `Nog niets opgehaald voor ${klas || config.groupPath}. Kies "Haal status uit GitLab".`
        : "Plak eerst een GitLab-token (fine-grained, alleen lezen). Zie de handleiding voor de benodigde rechten."}</div>`;
    } else if (node.type === "klas") {
      detail = html`<${KlasDetail} klas=${klas} students=${students} visible=${visible} settings=${settings} onPick=${pick} />`;
    } else if (node.type === "student") {
      detail = html`<${StudentDetail} s=${d.student} visible=${visible} settings=${settings} onPick=${pick}
        onRefresh=${refreshStudent} busy=${!!busy} />`;
    } else if (node.type === "repo") {
      detail = html`<${RepoDetail} s=${d.student} repo=${d.repo} settings=${settings} onPick=${pick} />`;
    } else if (node.type === "item") {
      detail = html`<${ItemDetail} item=${d.item} settings=${settings} />`;
    } else if (node.type === "commit") {
      detail = html`<${ItemDetail} item=${d.item} settings=${settings} focus=${d.commit.id} />`;
    }

    return html`<${React.Fragment}>
      <header className="bar">
        <div className="title"><span className="label">Docentoverzicht · ${config.groupPath}</span><h1>Voortgangsverkenner</h1></div>
        ${subgroups.length > 1 ? html`<div className="field"><span className="label" id="klas-label">Klas</span>
          <div className="seg" role="group" aria-labelledby="klas-label">${subgroups.map((k) => html`<button key=${k}
            aria-pressed=${k === klas} disabled=${!!busy} onClick=${() => setKlas(k)}>${k}</button>`)}</div></div>` : null}
        <${TokenField} token=${token} onAccept=${acceptToken} onForget=${forgetToken} />
      </header>
      <div className="status">
        <span className="note">Studentgegevens staan alleen in het geheugen van deze pagina en verdwijnen bij sluiten.</span>
        ${data ? html`<span className="muted">Status van ${fmtDateTime(data.fetchedAt)}</span>` : null}
        <button className="btn primary" disabled=${!token || !!busy} onClick=${refreshClass}>
          ${data ? "Ververs status uit GitLab" : "Haal status uit GitLab"}</button>
        ${busy ? html`<span className="status" role="status"><span className="spinner" aria-hidden="true"></span>${
          busy.text || `${busy.done} van ${busy.total} studenten`}</span>` : null}
      </div>
      ${error ? html`<p className="error" role="alert">${error}</p>` : null}
      <div className="options">
        <${RepoFilter} visible=${visible} setVisible=${setVisible} />
        <${SettingsPanel} settings=${settings} setSettings=${setSettings} />
      </div>
      <div className="legend"><span className="label">Stoplicht</span>
        ${["ok", "warn", "bad", "idle"].map((l) => html`<${Light} key=${l} l=${l} />`)}
        <span>Groen: done met eigen commits · Oranje: doing, of done zonder eigen commits · Rood: todo na de deadline ·
          Nog niet: deadline in de toekomst, telt niet mee</span></div>
      <main className="work">
        <section className="pane" aria-label="Verkenner">
          <div className="pane-head">
            <input type="search" placeholder="Zoek student" value=${query} onChange=${(e) => setQuery(e.target.value)} aria-label="Zoek student" />
            <label className="check"><input type="checkbox" checked=${filter} onChange=${(e) => setFilter(e.target.checked)} /> Alleen aandacht nodig</label>
          </div>
          ${data && root.children.length
            ? html`<${Tree} root=${root} open=${open} setOpen=${setOpen} selected=${selected} select=${setSelected} />`
            : html`<div className="empty">${data ? "Geen studenten gevonden." : "Nog geen gegevens."}</div>`}
        </section>
        <section className="pane" aria-live="polite">
          ${path.length > 1 ? html`<nav className="crumbs" aria-label="Kruimelpad">${path.slice(0, -1).map((n) => html`<${React.Fragment} key=${n.id}>
            <button onClick=${() => pick(n.id)}>${n.type === "commit" ? n.meta : n.label}</button><span aria-hidden="true">›</span><//>`)}</nav>` : null}
          ${detail}
        </section>
      </main>
    <//>`;
  }

  ReactDOM.createRoot(document.getElementById("app")).render(html`<${App} />`);
})();
