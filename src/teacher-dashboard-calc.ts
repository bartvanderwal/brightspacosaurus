/**
 * Pure calculation functions for the Teacher Progress Dashboard (Voortgangsverkenner).
 *
 * Provides student identifier extraction, stoplight status evaluation,
 * deadline handling, and repository/cohort threshold aggregation.
 *
 * @module
 */

/** Possible stoplight colors for work items and repositories. */
export type StoplightColor = "green" | "orange" | "red" | "gray";

/** Input parameters for evaluating a single work item. */
export interface WorkItemEvaluationInput {
  /** Built-in issue state ('opened' | 'closed') or GitLab status name. */
  state: string;
  /** Work item scoped status label if present (e.g. 'status::done', 'status::doing', 'status::todo'). */
  statusLabel?: string | null;
  /** Due date from work item (YYYY-MM-DD or ISO string) or milestone due date. */
  dueDate?: string | null;
  /** Number of commits by the student linked to this work item or its linked MR. */
  studentCommitsCount: number;
  /** Number of student comments/discussion notes on the work item. */
  studentCommentsCount: number;
  /** Whether comments are required for 100% (green) completion. */
  requireCommentsForDone: boolean;
  /** Reference date for deadline evaluation (defaults to current date). */
  referenceDate?: Date;
}

/** Evaluation result for a single work item. */
export interface WorkItemEvaluationResult {
  /** Stoplight color indicator. */
  color: StoplightColor;
  /** Explanation of why this color was assigned. */
  reason: string;
  /** Whether the work item is considered fully completed (green). */
  isDone: boolean;
  /** Whether this item is neutral (e.g. future deadline) and excluded from aggregate scoring. */
  isNeutral: boolean;
}

/** Aggregated stoplight evaluation for a repository. */
export interface RepoEvaluationResult {
  /** Aggregated stoplight color for the repository. */
  color: StoplightColor;
  /** Percentage of scorable work items that are not green (0..100). */
  incompletePercent: number;
  /** Total number of work items in this repository. */
  totalWorkItems: number;
  /** Total number of scorable work items (excluding neutral/future deadline items). */
  scorableWorkItems: number;
  /** Number of green work items. */
  greenCount: number;
  /** Number of orange work items. */
  orangeCount: number;
  /** Number of red work items. */
  redCount: number;
  /** Number of neutral/gray work items. */
  neutralCount: number;
  /** Explanation of the aggregated status. */
  reason: string;
}

/**
 * Extracts the student identifier from a repository name given a configured prefix.
 *
 * Repositories follow the convention: `<prefix>-<studentIdentifier>`.
 * For example, with prefix `"n2-ticketfaster-api"` and repo name
 * `"n2-ticketfaster-api-J-deBruin7"`, returns `"J-deBruin7"`.
 *
 * @param repoName The full name or path of the repository.
 * @param prefix The configured repository prefix.
 * @returns The student identifier or null if repoName does not match the prefix.
 */
export function extractStudentIdentifier(
  repoName: string,
  prefix: string,
): string | null {
  if (!repoName || !prefix) {
    return null;
  }

  const cleanRepo = repoName.trim();
  const cleanPrefix = prefix.trim();
  const expectedPrefix = `${cleanPrefix}-`;

  if (!cleanRepo.startsWith(expectedPrefix)) {
    return null;
  }

  const identifier = cleanRepo.slice(expectedPrefix.length).trim();
  return identifier.length > 0 ? identifier : null;
}

/**
 * Determines whether a commit was authored or committed by an instructor.
 *
 * @param authorUsername GitLab username of the commit author.
 * @param committerUsername GitLab username of the committer.
 * @param teacherUsernames List of configured instructor usernames.
 * @returns True if either author or committer matches any instructor username (case-insensitive).
 */
export function isTeacherCommit(
  authorUsername: string | undefined | null,
  committerUsername: string | undefined | null,
  teacherUsernames: string[],
): boolean {
  if (!teacherUsernames || teacherUsernames.length === 0) {
    return false;
  }

  const lowerTeachers = new Set(
    teacherUsernames.map((u) => u.trim().toLowerCase()),
  );

  if (authorUsername && lowerTeachers.has(authorUsername.trim().toLowerCase())) {
    return true;
  }
  if (
    committerUsername &&
    lowerTeachers.has(committerUsername.trim().toLowerCase())
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether a commit message references a specific work item / issue IID.
 *
 * Looks for `#<iid>` with non-digit boundaries (e.g. `feat: implement #22`, `#22: initial commit`).
 * Avoids false positives such as `#220` when looking for issue 22.
 *
 * @param commitMessage The commit message text.
 * @param issueIid The numeric internal ID (IID) of the work item.
 * @returns True if the commit message references `#<iid>`.
 */
export function isWorkItemCommit(
  commitMessage: string,
  issueIid: number,
): boolean {
  if (!commitMessage || typeof issueIid !== "number" || issueIid <= 0) {
    return false;
  }

  const pattern = new RegExp(`(?:^|\\D)#${issueIid}(?:\\D|$)`);
  return pattern.test(commitMessage);
}

/**
 * Evaluates the stoplight status of a single work item.
 *
 * Rules:
 * - Status 'done' with student commits and required comments -> Green.
 * - Status 'done' without student commits -> Orange ("Done without own student commits").
 * - Status 'done' missing comments when required -> Orange ("No comment/details provided in work item").
 * - Status 'doing' -> Orange ("Work item in progress (doing)").
 * - Status 'todo' with future deadline -> Gray ("Not yet due", neutral).
 * - Status 'todo' with overdue or missing deadline -> Red.
 *
 * @param input Evaluation parameters.
 * @returns Work item evaluation result.
 */
export function evaluateWorkItem(
  input: WorkItemEvaluationInput,
): WorkItemEvaluationResult {
  const {
    state,
    statusLabel,
    dueDate,
    studentCommitsCount,
    studentCommentsCount,
    requireCommentsForDone,
    referenceDate = new Date(),
  } = input;

  // 1. Determine logical progress state
  let logicalStatus: "done" | "doing" | "todo" = "todo";

  if (statusLabel) {
    const labelLower = statusLabel.toLowerCase();
    if (labelLower.includes("done") || labelLower.includes("closed")) {
      logicalStatus = "done";
    } else if (labelLower.includes("doing") || labelLower.includes("progress")) {
      logicalStatus = "doing";
    } else if (labelLower.includes("todo")) {
      logicalStatus = "todo";
    }
  } else if (state.toLowerCase() === "closed") {
    logicalStatus = "done";
  } else if (studentCommitsCount > 0 || studentCommentsCount > 0) {
    logicalStatus = "doing";
  } else {
    logicalStatus = "todo";
  }

  // 2. Evaluate 'done'
  if (logicalStatus === "done") {
    if (studentCommitsCount <= 0) {
      return {
        color: "orange",
        reason: "Done without own student commits",
        isDone: false,
        isNeutral: false,
      };
    }

    if (requireCommentsForDone && studentCommentsCount <= 0) {
      return {
        color: "orange",
        reason: "No comment/details provided in work item",
        isDone: false,
        isNeutral: false,
      };
    }

    return {
      color: "green",
      reason: "Completed with student commits and required details",
      isDone: true,
      isNeutral: false,
    };
  }

  // 3. Evaluate 'doing'
  if (logicalStatus === "doing") {
    return {
      color: "orange",
      reason: "Work item in progress (doing)",
      isDone: false,
      isNeutral: false,
    };
  }

  // 4. Evaluate 'todo' with deadline
  if (dueDate) {
    const parsedDue = new Date(dueDate);
    if (!Number.isNaN(parsedDue.getTime())) {
      // Set due date to end of that calendar day for comparison
      const dueEndOfDay = new Date(parsedDue);
      dueEndOfDay.setHours(23, 59, 59, 999);

      if (dueEndOfDay.getTime() >= referenceDate.getTime()) {
        return {
          color: "gray",
          reason: "Not yet due",
          isDone: false,
          isNeutral: true,
        };
      }
      return {
        color: "red",
        reason: "Overdue todo item",
        isDone: false,
        isNeutral: false,
      };
    }
  }

  return {
    color: "red",
    reason: "Todo item not started",
    isDone: false,
    isNeutral: false,
  };
}

/**
 * Evaluates the aggregated stoplight status for a repository based on its work items.
 *
 * Rules:
 * - Non-scorable (neutral/future deadline) items are excluded from total percentage.
 * - Repositories with 0 work items or only neutral items receive Gray status without penalty.
 * - Incomplete percentage is calculated as `(nonGreenItems / scorableItems) * 100`.
 * - Color assignment:
 *   - < orangeThresholdPercent -> Green
 *   - >= orangeThresholdPercent and <= redThresholdPercent -> Orange
 *   - > redThresholdPercent -> Red
 *
 * @param workItems Evaluated work items in the repository.
 * @param orangeThresholdPercent Incomplete threshold for orange (default: 10).
 * @param redThresholdPercent Incomplete threshold for red (default: 50).
 * @returns Aggregated repository evaluation.
 */
export function evaluateRepoStoplight(
  workItems: WorkItemEvaluationResult[],
  orangeThresholdPercent = 10,
  redThresholdPercent = 50,
): RepoEvaluationResult {
  const totalWorkItems = workItems.length;

  let greenCount = 0;
  let orangeCount = 0;
  let redCount = 0;
  let neutralCount = 0;

  for (const item of workItems) {
    if (item.isNeutral || item.color === "gray") {
      neutralCount++;
    } else if (item.color === "green") {
      greenCount++;
    } else if (item.color === "orange") {
      orangeCount++;
    } else if (item.color === "red") {
      redCount++;
    }
  }

  const scorableWorkItems = totalWorkItems - neutralCount;

  if (scorableWorkItems === 0) {
    const reason = totalWorkItems === 0
      ? "No work items in repository"
      : "All work items not yet due";
    return {
      color: "gray",
      incompletePercent: 0,
      totalWorkItems,
      scorableWorkItems: 0,
      greenCount,
      orangeCount,
      redCount,
      neutralCount,
      reason,
    };
  }

  const nonGreenCount = orangeCount + redCount;
  const incompletePercent = Math.round(
    (nonGreenCount / scorableWorkItems) * 1000,
  ) / 10;

  let color: StoplightColor;
  let reason: string;

  if (incompletePercent > redThresholdPercent) {
    color = "red";
    reason = `${incompletePercent}% incomplete items (exceeds ${redThresholdPercent}% threshold)`;
  } else if (incompletePercent >= orangeThresholdPercent) {
    color = "orange";
    reason = `${incompletePercent}% incomplete items (between ${orangeThresholdPercent}% and ${redThresholdPercent}%)`;
  } else {
    color = "green";
    reason = `${incompletePercent}% incomplete items (below ${orangeThresholdPercent}% threshold)`;
  }

  return {
    color,
    incompletePercent,
    totalWorkItems,
    scorableWorkItems,
    greenCount,
    orangeCount,
    redCount,
    neutralCount,
    reason,
  };
}
