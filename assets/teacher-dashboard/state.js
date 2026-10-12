(function () {
  "use strict";

  function weekNodeId(klas, week) {
    return `klas/${klas}/week/${week.startsOn}`;
  }

  function focusWeek(klas, week, open) {
    const id = weekNodeId(klas, week);
    return {
      id,
      open: new Set([...open, `klas/${klas}`, id]),
    };
  }

  function orderedWeeks(weeks, currentWeekIndex) {
    return weeks.map((week, index) => ({ week, index })).sort((a, b) => {
      if (a.index === currentWeekIndex) return -1;
      if (b.index === currentWeekIndex) return 1;
      const aIsPast = a.index < currentWeekIndex;
      const bIsPast = b.index < currentWeekIndex;
      if (aIsPast !== bIsPast) return aIsPast ? -1 : 1;
      return aIsPast ? b.index - a.index : a.index - b.index;
    });
  }

  function studentNodeId(parentId, studentId) {
    return parentId ? `${parentId}/${studentId}` : studentId;
  }

  function repoNodeId(studentId, prefix) {
    return `${studentId}/${prefix}`;
  }

  function itemNodeId(repoId, iid) {
    return `${repoId}/${iid}`;
  }

  function commitNodeId(itemId, commitId) {
    return `${itemId}/${commitId}`;
  }

  function findPath(root, id) {
    const path = [];
    (function walk(n) {
      path.push(n);
      if (n.id === id) return true;
      for (const child of n.children) if (walk(child)) return true;
      path.pop();
      return false;
    })(root);
    return path;
  }

  function selectPath(root, id, open) {
    const path = findPath(root, id);
    const nextOpen = new Set(open);
    path.slice(0, -1).forEach((n) => nextOpen.add(n.id));
    return {
      path,
      open: nextOpen,
      weekTitle: path.find((n) => n.type === "week")?.data?.week?.title,
    };
  }

  function mergeRepos(previous, fresh, updatedPrefixes, repoOrder) {
    const updated = new Set(updatedPrefixes);
    const order = new Map(repoOrder.map((prefix, index) => [prefix, index]));
    return [
      ...previous.filter((repo) => !updated.has(repo.prefix)),
      ...fresh,
    ].sort((a, b) => order.get(a.prefix) - order.get(b.prefix));
  }

  function mergeStudent(previous, fresh, updatedPrefixes, repoOrder) {
    return {
      ...fresh,
      repos: previous
        ? mergeRepos(previous.repos, fresh.repos, updatedPrefixes, repoOrder)
        : fresh.repos,
    };
  }

  const CACHE_PREFIX = "bso-dashboard-cache-v1:";
  const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

  function cacheKey(config, klas) {
    return CACHE_PREFIX + JSON.stringify([
      config.gitlabUrl.replace(/\/+$/, ""), config.groupPath, klas,
      config.repos, config.weeks || [], config.teacherUsernames || [],
    ]);
  }

  function pruneData(data, now) {
    if (!data || typeof data !== "object" || !data.students ||
      typeof data.students !== "object" || Array.isArray(data.students) ||
      !Number.isFinite(Date.parse(data.fetchedAt))) {
      throw new Error("Ongeldige gegevens in de lokale Voortgangsverkenner-cache.");
    }
    const students = {};
    if (Date.parse(data.fetchedAt) > now) return null;
    for (const [id, student] of Object.entries(data.students)) {
      if (!student || student.studentId !== id || !Array.isArray(student.repos)) {
        throw new Error("Ongeldige student in de lokale Voortgangsverkenner-cache.");
      }
      const repos = student.repos.filter((repo) => {
        if (!repo || typeof repo.prefix !== "string" || !Array.isArray(repo.workItems)) {
          throw new Error("Ongeldige repository in de lokale Voortgangsverkenner-cache.");
        }
        const age = now - Date.parse(repo.fetchedAt);
        return Number.isFinite(age) && age >= 0 && age < MAX_CACHE_AGE;
      });
      if (repos.length) students[id] = { studentId: id, repos, fetchedAt: student.fetchedAt };
    }
    if (!Object.keys(students).length && now - Date.parse(data.fetchedAt) >= MAX_CACHE_AGE) return null;
    return { students, fetchedAt: data.fetchedAt };
  }

  function pruneCache(storage, now = Date.now()) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key) => key && key.startsWith(CACHE_PREFIX));
    for (const key of keys) {
      let data;
      try {
        const envelope = JSON.parse(storage.getItem(key));
        if (envelope.version !== 1) throw new Error("Onbekende cacheversie.");
        data = pruneData(envelope.data, now);
      } catch (error) {
        storage.removeItem(key);
        throw new Error(`Lokale cache kon niet worden gelezen en is verwijderd: ${error.message}`);
      }
      if (data) storage.setItem(key, JSON.stringify({ version: 1, data }));
      else storage.removeItem(key);
    }
  }

  function readCache(storage, config, classes, now = Date.now()) {
    pruneCache(storage, now);
    const result = {};
    for (const klas of classes) {
      const raw = storage.getItem(cacheKey(config, klas));
      if (raw) result[klas] = JSON.parse(raw).data;
    }
    return result;
  }

  function writeCache(storage, config, dataByKlas, now = Date.now()) {
    pruneCache(storage, now);
    for (const [klas, value] of Object.entries(dataByKlas)) {
      const data = pruneData(value, now);
      if (data) storage.setItem(cacheKey(config, klas), JSON.stringify({ version: 1, data }));
      else storage.removeItem(cacheKey(config, klas));
    }
  }

  function clearCache(storage) {
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key && key.startsWith(CACHE_PREFIX)) storage.removeItem(key);
    }
  }

  function staleRepoPrefixes(config, data, now = Date.now()) {
    const weeks = config.weeks || [];
    const currentIndex = globalThis.bsoDashboardCalc.currentWeekIndex(weeks, new Date(now));
    return config.repos.filter((configured) => {
      const weekIndex = weeks.findIndex((item) => item.repos.includes(configured.prefix));
      const ttl = weekIndex >= 0 && weekIndex < currentIndex
        ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
      const students = Object.values(data?.students || {});
      const age = now - Date.parse(data?.fetchedAt);
      return !data || (!students.length && (!Number.isFinite(age) || age < 0 || age >= ttl)) ||
        students.some((student) => {
          const repo = student.repos.find((item) => item.prefix === configured.prefix);
          const age = now - Date.parse(repo?.fetchedAt);
          return !repo || repo.error || repo.warning || !Number.isFinite(age) || age < 0 || age >= ttl;
        });
    }).map((repo) => repo.prefix);
  }

  globalThis.bsoDashboardState = {
    weekNodeId,
    focusWeek,
    orderedWeeks,
    studentNodeId,
    repoNodeId,
    itemNodeId,
    commitNodeId,
    findPath,
    selectPath,
    mergeRepos,
    mergeStudent,
    cacheKey,
    pruneCache,
    readCache,
    writeCache,
    clearCache,
    staleRepoPrefixes,
  };
})();
