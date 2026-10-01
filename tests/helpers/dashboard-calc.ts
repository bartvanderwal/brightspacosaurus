/**
 * Typed access to assets/teacher-dashboard/calc.js for tests.
 *
 * The dashboard page runs calc.js as a classic browser script. Evaluating the
 * same file here means the tests exercise the rules the dashboard really uses.
 */
import { loadAssetText } from "../../src/assets.ts";

/** Possible stoplight colors for work items and repositories. */
export type StoplightColor = "green" | "orange" | "red" | "gray";

/** Input for evaluating a single work item. */
export interface WorkItemEvaluationInput {
  state: string;
  statusLabel?: string | null;
  dueDate?: string | null;
  studentCommitsCount: number;
  studentCommentsCount: number;
  requireCommentsForDone: boolean;
  referenceDate?: Date;
}

/** Evaluation result for a single work item. */
export interface WorkItemEvaluationResult {
  color: StoplightColor;
  reason: string;
  isDone: boolean;
  isNeutral: boolean;
}

/** Aggregated stoplight evaluation for a repository. */
export interface RepoEvaluationResult {
  color: StoplightColor;
  incompletePercent: number;
  totalWorkItems: number;
  scorableWorkItems: number;
  greenCount: number;
  orangeCount: number;
  redCount: number;
  neutralCount: number;
  reason: string;
}

interface DashboardCalc {
  extractStudentIdentifier(repoName: string, prefix: string): string | null;
  isTeacherCommit(
    author: string | null | undefined,
    committer: string | null | undefined,
    teacherUsernames: string[],
  ): boolean;
  isWorkItemCommit(commitMessage: string, issueIid: number): boolean;
  evaluateWorkItem(input: WorkItemEvaluationInput): WorkItemEvaluationResult;
  evaluateRepoStoplight(
    workItems: WorkItemEvaluationResult[],
    orangeThresholdPercent?: number,
    redThresholdPercent?: number,
  ): RepoEvaluationResult;
}

const sandbox: { bsoDashboardCalc?: DashboardCalc } = {};
new Function(
  "globalThis",
  await loadAssetText("teacher-dashboard/calc.js"),
)(sandbox);

export const {
  extractStudentIdentifier,
  isTeacherCommit,
  isWorkItemCommit,
  evaluateWorkItem,
  evaluateRepoStoplight,
} = sandbox.bsoDashboardCalc!;
