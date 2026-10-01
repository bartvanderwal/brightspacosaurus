/*
 * Pure calculation functions for the teacher progress dashboard
 * (Voortgangsverkenner, #37): student identifier extraction, teacher
 * exclusion, commit-to-work-item linking and stoplight rules.
 *
 * This file is the single source of these rules. The dashboard page loads it
 * as a classic script before app.js; the Deno tests evaluate the same file
 * (tests/helpers/dashboard-calc.ts), so tests exercise the code that runs.
 */
(function (root) {
  "use strict";

  /**
   * Student identifier from a repository path `<prefix>-<student>`.
   * @param {string} repoName
   * @param {string} prefix
   * @returns {string | null}
   */
  function extractStudentIdentifier(repoName, prefix) {
    if (!repoName || !prefix) return null;
    const expectedPrefix = `${prefix.trim()}-`;
    const cleanRepo = repoName.trim();
    if (!cleanRepo.startsWith(expectedPrefix)) return null;
    const postfix = cleanRepo.slice(expectedPrefix.length).trim();
    return postfix.length > 0 ? postfix : null;
  }

  /**
   * True when the author or committer is one of the configured teachers
   * (case-insensitive).
   * @param {string | null | undefined} author
   * @param {string | null | undefined} committer
   * @param {string[]} teacherUsernames
   * @returns {boolean}
   */
  function isTeacherCommit(author, committer, teacherUsernames) {
    if (!teacherUsernames || teacherUsernames.length === 0) return false;
    const teachers = new Set(teacherUsernames.map((u) => u.trim().toLowerCase()));
    return [author, committer].some(
      (name) => !!name && teachers.has(name.trim().toLowerCase()),
    );
  }

  /**
   * True when the commit message references `#<iid>` (not `#<iid>0`).
   * @param {string} commitMessage
   * @param {number} issueIid
   * @returns {boolean}
   */
  function isWorkItemCommit(commitMessage, issueIid) {
    if (!commitMessage || typeof issueIid !== "number" || issueIid <= 0) {
      return false;
    }
    return new RegExp(`(?:^|\\D)#${issueIid}(?:\\D|$)`).test(commitMessage);
  }

  /**
   * Stoplight for one work item.
   * @param {{ state: string, statusLabel?: string | null, dueDate?: string | null,
   *   studentCommitsCount: number, studentCommentsCount: number,
   *   requireCommentsForDone: boolean, referenceDate?: Date }} input
   * @returns {{ color: "green" | "orange" | "red" | "gray", reason: string,
   *   isDone: boolean, isNeutral: boolean }}
   */
  function evaluateWorkItem(input) {
    const {
      state,
      statusLabel,
      dueDate,
      studentCommitsCount,
      studentCommentsCount,
      requireCommentsForDone,
      referenceDate = new Date(),
    } = input;

    let logicalStatus = "todo";
    if (statusLabel) {
      const label = statusLabel.toLowerCase();
      if (label.includes("done") || label.includes("closed")) {
        logicalStatus = "done";
      } else if (label.includes("doing") || label.includes("progress")) {
        logicalStatus = "doing";
      }
    } else if ((state || "").toLowerCase() === "closed") {
      logicalStatus = "done";
    } else if (studentCommitsCount > 0 || studentCommentsCount > 0) {
      logicalStatus = "doing";
    }

    if (logicalStatus === "done") {
      if (studentCommitsCount <= 0) {
        return { color: "orange", reason: "Status done zonder eigen commits", isDone: false, isNeutral: false };
      }
      if (requireCommentsForDone && studentCommentsCount <= 0) {
        return { color: "orange", reason: "Status done, maar geen opmerking van de student", isDone: false, isNeutral: false };
      }
      return { color: "green", reason: "Status done met eigen commits", isDone: true, isNeutral: false };
    }

    if (logicalStatus === "doing") {
      return { color: "orange", reason: "Status doing", isDone: false, isNeutral: false };
    }

    if (dueDate) {
      const parsedDue = new Date(dueDate);
      if (!Number.isNaN(parsedDue.getTime())) {
        const dueEndOfDay = new Date(parsedDue);
        dueEndOfDay.setHours(23, 59, 59, 999);
        if (dueEndOfDay.getTime() >= referenceDate.getTime()) {
          return { color: "gray", reason: "Deadline nog niet verstreken", isDone: false, isNeutral: true };
        }
        return { color: "red", reason: "Status todo, deadline verstreken", isDone: false, isNeutral: false };
      }
    }

    return { color: "red", reason: "Status todo, nog niet begonnen", isDone: false, isNeutral: false };
  }

  /**
   * Aggregated stoplight for a repository from evaluated work items.
   * @param {Array<{ color: string, isNeutral: boolean }>} workItems
   * @param {number} [orangeThresholdPercent]
   * @param {number} [redThresholdPercent]
   */
  function evaluateRepoStoplight(workItems, orangeThresholdPercent = 10, redThresholdPercent = 50) {
    const totalWorkItems = workItems.length;
    let greenCount = 0;
    let orangeCount = 0;
    let redCount = 0;
    let neutralCount = 0;

    for (const item of workItems) {
      if (item.isNeutral || item.color === "gray") neutralCount++;
      else if (item.color === "green") greenCount++;
      else if (item.color === "orange") orangeCount++;
      else if (item.color === "red") redCount++;
    }

    const counts = { totalWorkItems, greenCount, orangeCount, redCount, neutralCount };
    const scorableWorkItems = totalWorkItems - neutralCount;

    if (scorableWorkItems === 0) {
      return {
        color: "gray",
        incompletePercent: 0,
        scorableWorkItems: 0,
        ...counts,
        reason: totalWorkItems === 0 ? "Geen work items in deze repo" : "Alle work items hebben een toekomstige deadline",
      };
    }

    const incompletePercent = Math.round(((orangeCount + redCount) / scorableWorkItems) * 1000) / 10;
    let color;
    let reason;
    if (incompletePercent > redThresholdPercent) {
      color = "red";
      reason = `${incompletePercent}% niet groen (boven ${redThresholdPercent}%)`;
    } else if (incompletePercent >= orangeThresholdPercent) {
      color = "orange";
      reason = `${incompletePercent}% niet groen (tussen ${orangeThresholdPercent}% en ${redThresholdPercent}%)`;
    } else {
      color = "green";
      reason = `${incompletePercent}% niet groen (onder ${orangeThresholdPercent}%)`;
    }

    return { color, incompletePercent, scorableWorkItems, ...counts, reason };
  }

  root.bsoDashboardCalc = {
    extractStudentIdentifier,
    isTeacherCommit,
    isWorkItemCommit,
    evaluateWorkItem,
    evaluateRepoStoplight,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
