/**
 * Tests for teacher dashboard calculation functions.
 *
 * Covers student identifier extraction, teacher exclusion, commit message linking,
 * work item stoplight rules, and repository aggregate scoring.
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import {
  evaluateRepoStoplight,
  evaluateWorkItem,
  extractStudentIdentifier,
  isTeacherCommit,
  isWorkItemCommit,
  type StoplightColor,
  type WorkItemEvaluationResult,
} from "../src/teacher-dashboard-calc.ts";

// ---------------------------------------------------------------------------
// Student Identifier Extraction
// ---------------------------------------------------------------------------

Deno.test("extractStudentIdentifier extracts student name from repo name with prefix", () => {
  assertEquals(
    extractStudentIdentifier("pod-s123456", "pod"),
    "s123456",
  );
  assertEquals(
    extractStudentIdentifier("n2-ticketfaster-api-J-deBruin7", "n2-ticketfaster-api"),
    "J-deBruin7",
  );
  assertEquals(
    extractStudentIdentifier("n1-chuck-a-luck-alice", "n1-chuck-a-luck"),
    "alice",
  );
});

Deno.test("extractStudentIdentifier returns null on prefix mismatch or invalid format", () => {
  assertEquals(
    extractStudentIdentifier("n3-expense-pro-alice", "n2-ticketfaster-api"),
    null,
  );
  assertEquals(extractStudentIdentifier("pod", "pod"), null);
  assertEquals(extractStudentIdentifier("pod-", "pod"), null);
  assertEquals(extractStudentIdentifier("", "pod"), null);
  assertEquals(extractStudentIdentifier("pod-student", ""), null);
});

Deno.test("Property: extractStudentIdentifier roundtrips with any valid strings", () => {
  fc.assert(
    fc.property(
      fc.stringMatching(/^[a-z0-9-]+$/),
      fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
      (prefix: string, studentId: string) => {
        if (!prefix || !studentId) return;
        const repoName = `${prefix}-${studentId}`;
        const result = extractStudentIdentifier(repoName, prefix);
        assertEquals(result, studentId);
      },
    ),
    { numRuns: 100 },
  );
});

// ---------------------------------------------------------------------------
// Teacher Commit Detection
// ---------------------------------------------------------------------------

Deno.test("isTeacherCommit identifies instructor commits by author or committer username (case-insensitive)", () => {
  const teachers = ["docentA", "docentB"];

  assertEquals(isTeacherCommit("docentA", "student", teachers), true);
  assertEquals(isTeacherCommit("DOCENTA", "student", teachers), true);
  assertEquals(isTeacherCommit("student", "docentB", teachers), true);
  assertEquals(isTeacherCommit("student", "student", teachers), false);
  assertEquals(isTeacherCommit(null, undefined, teachers), false);
  assertEquals(isTeacherCommit("docentA", "student", []), false);
});

// ---------------------------------------------------------------------------
// Work Item Commit Reference Detection
// ---------------------------------------------------------------------------

Deno.test("isWorkItemCommit matches #<iid> with boundaries", () => {
  assertEquals(isWorkItemCommit("Implement #22 initial version", 22), true);
  assertEquals(isWorkItemCommit("#22 done", 22), true);
  assertEquals(isWorkItemCommit("fixed issue (#22)", 22), true);
  assertEquals(isWorkItemCommit("Closes #22.", 22), true);

  // False positives check: substring numbers should not match
  assertEquals(isWorkItemCommit("fix #220 something", 22), false);
  assertEquals(isWorkItemCommit("fix #122 something", 22), false);
  assertEquals(isWorkItemCommit("fix #2 something", 22), false);
  assertEquals(isWorkItemCommit("", 22), false);
  assertEquals(isWorkItemCommit("no issue mentioned", 22), false);
});

// ---------------------------------------------------------------------------
// Work Item Stoplight Status Evaluation
// ---------------------------------------------------------------------------

Deno.test("evaluateWorkItem: done with student commits and comments is green", () => {
  const result = evaluateWorkItem({
    state: "closed",
    studentCommitsCount: 3,
    studentCommentsCount: 2,
    requireCommentsForDone: true,
  });

  assertEquals(result.color, "green");
  assertEquals(result.isDone, true);
  assertEquals(result.isNeutral, false);
});

Deno.test("evaluateWorkItem: done without student commits is orange", () => {
  const result = evaluateWorkItem({
    state: "closed",
    studentCommitsCount: 0,
    studentCommentsCount: 2,
    requireCommentsForDone: false,
  });

  assertEquals(result.color, "orange");
  assertEquals(result.isDone, false);
  assertEquals(result.reason, "Done without own student commits");
});

Deno.test("evaluateWorkItem: done without comments when requireCommentsForDone is true is orange", () => {
  const result = evaluateWorkItem({
    state: "closed",
    studentCommitsCount: 2,
    studentCommentsCount: 0,
    requireCommentsForDone: true,
  });

  assertEquals(result.color, "orange");
  assertEquals(result.isDone, false);
  assertEquals(result.reason, "No comment/details provided in work item");
});

Deno.test("evaluateWorkItem: done without comments when requireCommentsForDone is false is green", () => {
  const result = evaluateWorkItem({
    state: "closed",
    studentCommitsCount: 2,
    studentCommentsCount: 0,
    requireCommentsForDone: false,
  });

  assertEquals(result.color, "green");
  assertEquals(result.isDone, true);
});

Deno.test("evaluateWorkItem: status 'doing' or opened with student commits is orange", () => {
  const openedWithCommits = evaluateWorkItem({
    state: "opened",
    studentCommitsCount: 1,
    studentCommentsCount: 0,
    requireCommentsForDone: false,
  });
  assertEquals(openedWithCommits.color, "orange");
  assertEquals(openedWithCommits.reason, "Work item in progress (doing)");

  const scopedDoing = evaluateWorkItem({
    state: "opened",
    statusLabel: "status::doing",
    studentCommitsCount: 0,
    studentCommentsCount: 0,
    requireCommentsForDone: false,
  });
  assertEquals(scopedDoing.color, "orange");
});

Deno.test("evaluateWorkItem: todo with future deadline is gray (neutral)", () => {
  const refDate = new Date("2026-10-01T10:00:00Z");
  const futureDue = "2026-10-15";

  const result = evaluateWorkItem({
    state: "opened",
    dueDate: futureDue,
    studentCommitsCount: 0,
    studentCommentsCount: 0,
    requireCommentsForDone: false,
    referenceDate: refDate,
  });

  assertEquals(result.color, "gray");
  assertEquals(result.isNeutral, true);
  assertEquals(result.reason, "Not yet due");
});

Deno.test("evaluateWorkItem: todo with overdue deadline is red", () => {
  const refDate = new Date("2026-10-01T10:00:00Z");
  const pastDue = "2026-09-20";

  const result = evaluateWorkItem({
    state: "opened",
    dueDate: pastDue,
    studentCommitsCount: 0,
    studentCommentsCount: 0,
    requireCommentsForDone: false,
    referenceDate: refDate,
  });

  assertEquals(result.color, "red");
  assertEquals(result.isNeutral, false);
  assertEquals(result.reason, "Overdue todo item");
});

Deno.test("evaluateWorkItem: todo without deadline is red", () => {
  const result = evaluateWorkItem({
    state: "opened",
    studentCommitsCount: 0,
    studentCommentsCount: 0,
    requireCommentsForDone: false,
  });

  assertEquals(result.color, "red");
  assertEquals(result.isNeutral, false);
  assertEquals(result.reason, "Todo item not started");
});

// ---------------------------------------------------------------------------
// Repository Stoplight Evaluation & Thresholds
// ---------------------------------------------------------------------------

Deno.test("evaluateRepoStoplight: empty repository or only neutral items is gray", () => {
  const emptyResult = evaluateRepoStoplight([]);
  assertEquals(emptyResult.color, "gray");
  assertEquals(emptyResult.totalWorkItems, 0);
  assertEquals(emptyResult.scorableWorkItems, 0);

  const allNeutral: WorkItemEvaluationResult[] = [
    { color: "gray", reason: "Not yet due", isDone: false, isNeutral: true },
    { color: "gray", reason: "Not yet due", isDone: false, isNeutral: true },
  ];
  const neutralResult = evaluateRepoStoplight(allNeutral);
  assertEquals(neutralResult.color, "gray");
  assertEquals(neutralResult.totalWorkItems, 2);
  assertEquals(neutralResult.scorableWorkItems, 0);
  assertEquals(neutralResult.neutralCount, 2);
});

Deno.test("evaluateRepoStoplight: default thresholds (10% and 50%)", () => {
  // 10 items: 10 green -> 0% non-green -> green
  const items10Green: WorkItemEvaluationResult[] = Array.from({ length: 10 }, () => ({
    color: "green",
    reason: "Done",
    isDone: true,
    isNeutral: false,
  }));
  const res1 = evaluateRepoStoplight(items10Green, 10, 50);
  assertEquals(res1.color, "green");
  assertEquals(res1.incompletePercent, 0);

  // 10 items: 9 green, 1 orange -> 10% non-green -> orange (>= 10% and <= 50%)
  const items1Orange = [...items10Green.slice(0, 9), {
    color: "orange" as const,
    reason: "Doing",
    isDone: false,
    isNeutral: false,
  }];
  const res2 = evaluateRepoStoplight(items1Orange, 10, 50);
  assertEquals(res2.color, "orange");
  assertEquals(res2.incompletePercent, 10);

  // 10 items: 4 green, 6 red -> 60% non-green -> red (> 50%)
  const items6Red = [
    ...items10Green.slice(0, 4),
    ...Array.from({ length: 6 }, () => ({
      color: "red" as const,
      reason: "Todo",
      isDone: false,
      isNeutral: false,
    })),
  ];
  const res3 = evaluateRepoStoplight(items6Red, 10, 50);
  assertEquals(res3.color, "red");
  assertEquals(res3.incompletePercent, 60);
});

Deno.test("evaluateRepoStoplight: neutral items excluded from calculation denominator", () => {
  // 5 green items + 5 neutral items -> 0 non-green out of 5 scorable -> 0% -> green
  const itemsWithNeutral: WorkItemEvaluationResult[] = [
    ...Array.from({ length: 5 }, () => ({
      color: "green" as const,
      reason: "Done",
      isDone: true,
      isNeutral: false,
    })),
    ...Array.from({ length: 5 }, () => ({
      color: "gray" as const,
      reason: "Not yet due",
      isDone: false,
      isNeutral: true,
    })),
  ];
  const res = evaluateRepoStoplight(itemsWithNeutral, 10, 50);
  assertEquals(res.color, "green");
  assertEquals(res.totalWorkItems, 10);
  assertEquals(res.scorableWorkItems, 5);
  assertEquals(res.incompletePercent, 0);
});

Deno.test("Property: evaluateRepoStoplight preserves mathematical bounds and thresholds", () => {
  const itemColorArb = fc.constantFrom("green", "orange", "red", "gray");

  fc.assert(
    fc.property(
      fc.array(
        itemColorArb.map((color: StoplightColor) => ({
          color,
          reason: "test",
          isDone: color === "green",
          isNeutral: color === "gray",
        })),
        { minLength: 1, maxLength: 50 },
      ),
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 41, max: 100 }),
      (items: WorkItemEvaluationResult[], orangeThresh: number, redThresh: number) => {
        const evalResult = evaluateRepoStoplight(items, orangeThresh, redThresh);

        if (evalResult.scorableWorkItems === 0) {
          assertEquals(evalResult.color, "gray");
          assertEquals(evalResult.incompletePercent, 0);
        } else {
          assertEquals(evalResult.incompletePercent >= 0, true);
          assertEquals(evalResult.incompletePercent <= 100, true);

          if (evalResult.incompletePercent > redThresh) {
            assertEquals(evalResult.color, "red");
          } else if (evalResult.incompletePercent >= orangeThresh) {
            assertEquals(evalResult.color, "orange");
          } else {
            assertEquals(evalResult.color, "green");
          }
        }
      },
    ),
    { numRuns: 100 },
  );
});
