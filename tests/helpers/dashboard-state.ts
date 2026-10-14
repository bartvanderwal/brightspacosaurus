import { loadAssetText } from "../../src/assets.ts";

export interface DashboardNode {
  id: string;
  type: string;
  children: DashboardNode[];
  data?: { week: { title: string } };
}

interface DashboardState {
  cacheKey(config: CacheConfig, klas: string): string;
  pruneCache(storage: Storage, now?: number): void;
  readCache(
    storage: Storage,
    config: CacheConfig,
    classes: string[],
    now?: number,
  ): Record<string, CacheData>;
  writeCache(
    storage: Storage,
    config: CacheConfig,
    data: Record<string, CacheData>,
    now?: number,
  ): void;
  clearCache(storage: Storage): void;
  staleRepoPrefixes(
    config: CacheConfig,
    data?: CacheData,
    now?: number,
  ): string[];
  weekNodeId(klas: string, week: { startsOn: string }): string;
  focusWeek(
    klas: string,
    week: { startsOn: string },
    open: Set<string>,
  ): { id: string; open: Set<string> };
  orderedWeeks<T extends { startsOn: string }>(
    weeks: T[],
    currentWeekIndex: number,
  ): Array<{ week: T; index: number }>;
  studentNodeId(parentId: string | null, studentId: string): string;
  repoNodeId(studentId: string, prefix: string): string;
  itemNodeId(repoId: string, iid: number): string;
  commitNodeId(itemId: string, commitId: string): string;
  findPath(root: DashboardNode, id: string): DashboardNode[];
  selectPath(
    root: DashboardNode,
    id: string,
    open: Set<string>,
  ): { path: DashboardNode[]; open: Set<string>; weekTitle?: string };
  mergeStudent<T extends { prefix: string }>(
    previous: { repos: T[] } | undefined,
    fresh: { repos: T[]; [key: string]: unknown },
    updatedPrefixes: Iterable<string>,
    repoOrder: string[],
  ): { repos: T[]; [key: string]: unknown };
}

export interface CacheConfig {
  gitlabUrl: string;
  groupPath: string;
  repos: Array<{ prefix: string; label?: string }>;
  weeks?: Array<{ title: string; startsOn: string; repos: string[] }>;
  teacherUsernames?: string[];
}

export interface CacheData {
  fetchedAt: string;
  students: Record<string, {
    studentId: string;
    fetchedAt: string;
    repos: Array<{
      prefix: string;
      fetchedAt: string;
      workItems: unknown[];
      error?: string;
      warning?: string;
    }>;
  }>;
}

const sandbox: { bsoDashboardState?: DashboardState } = {};
new Function(
  "globalThis",
  await loadAssetText("teacher-dashboard/calc.js"),
)(sandbox);
new Function(
  "globalThis",
  await loadAssetText("teacher-dashboard/state.js"),
)(sandbox);

export const dashboardState = sandbox.bsoDashboardState!;
