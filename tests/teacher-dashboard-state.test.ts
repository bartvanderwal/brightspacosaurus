import { assertEquals } from "@std/assert";
import { dashboardState, type DashboardNode } from "./helpers/dashboard-state.ts";

Deno.test("dashboard orders weeks with the current week first", () => {
  const weeks = [
    { title: "Week 1", startsOn: "2026-09-01" },
    { title: "Week 2", startsOn: "2026-09-08" },
    { title: "Week 3", startsOn: "2026-09-15" },
    { title: "Week 4", startsOn: "2026-09-22" },
    { title: "Week 5", startsOn: "2026-09-29" },
  ];

  assertEquals(
    dashboardState.orderedWeeks(weeks, 2).map(({ week }) => week.title),
    ["Week 3", "Week 2", "Week 1", "Week 4", "Week 5"],
  );
});

Deno.test("manual week focus and student selection preserve the week path", () => {
  const week = { title: "Week 3", startsOn: "2026-09-15" };
  const classId = "klas/class-a";
  const weekId = dashboardState.weekNodeId("class-a", week);
  const focus = dashboardState.focusWeek("class-a", week, new Set());
  assertEquals(focus.id, weekId);
  assertEquals([...focus.open], [classId, weekId]);
  const studentId = dashboardState.studentNodeId(weekId, "student-1");
  const student: DashboardNode = { id: studentId, type: "student", children: [] };
  const weekNode: DashboardNode = {
    id: weekId,
    type: "week",
    data: { week },
    children: [student],
  };
  const root: DashboardNode = { id: classId, type: "klas", children: [weekNode] };

  const selection = dashboardState.selectPath(root, studentId, new Set([classId]));
  assertEquals(selection.path.map((node) => node.id), [classId, weekId, studentId]);
  assertEquals([...selection.open], [classId, weekId]);
  assertEquals(selection.weekTitle, week.title);
});

Deno.test("week-prefixed drill-down IDs resolve student, repo, item, and commit paths", () => {
  const weekId = dashboardState.weekNodeId("class-a", { startsOn: "2026-09-15" });
  const studentId = dashboardState.studentNodeId(weekId, "student-1");
  const repoId = dashboardState.repoNodeId(studentId, "project");
  const itemId = dashboardState.itemNodeId(repoId, 42);
  const commitId = dashboardState.commitNodeId(itemId, "abc123");
  const commit: DashboardNode = { id: commitId, type: "commit", children: [] };
  const item: DashboardNode = { id: itemId, type: "item", children: [commit] };
  const repo: DashboardNode = { id: repoId, type: "repo", children: [item] };
  const student: DashboardNode = { id: studentId, type: "student", children: [repo] };
  const week: DashboardNode = { id: weekId, type: "week", children: [student] };
  const root: DashboardNode = { id: "klas/class-a", type: "klas", children: [week] };

  assertEquals(
    dashboardState.findPath(root, commitId).map((node) => node.id),
    [root.id, weekId, studentId, repoId, itemId, commitId],
  );
});

Deno.test("partial refresh replaces selected repos and retains cached repos with their metadata", () => {
  const untouchedRepo = {
    prefix: "week-1",
    fetchedAt: "2026-09-01T10:00:00.000Z",
    workItems: [{ iid: 1 }],
  };
  const previous = {
    fetchedAt: "2026-09-01T10:00:00.000Z",
    repos: [
      untouchedRepo,
      { prefix: "week-2", fetchedAt: "2026-09-08T10:00:00.000Z", workItems: [{ iid: 2 }] },
    ],
  };
  const fresh = {
    fetchedAt: "2026-09-15T10:00:00.000Z",
    repos: [{ prefix: "week-2", fetchedAt: "2026-09-15T10:00:00.000Z", workItems: [{ iid: 3 }] }],
  };

  const merged = dashboardState.mergeStudent(previous, fresh, ["week-2"], ["week-1", "week-2"]);
  assertEquals(merged.fetchedAt, fresh.fetchedAt);
  assertEquals(merged.repos, [
    untouchedRepo,
    { prefix: "week-2", fetchedAt: "2026-09-15T10:00:00.000Z", workItems: [{ iid: 3 }] },
  ]);
  assertEquals(merged.repos[0], untouchedRepo);
});
