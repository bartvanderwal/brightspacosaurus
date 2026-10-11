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
  };
})();
