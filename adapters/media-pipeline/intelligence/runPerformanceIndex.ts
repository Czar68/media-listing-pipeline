import type { FinalListingRecord } from "../finalization/finalListingRecord";
import { loadPersistedListingRecords } from "../persistence/listingStore";
import {
  compareRuns,
  computeRunPerformance,
  groupRecordsByRunId,
  type RunComparison,
  type RunPerformanceModel,
} from "./runPerformanceModel";

function maxTimestampForRun(records: readonly FinalListingRecord[]): string {
  if (records.length === 0) {
    return "";
  }
  return [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp, "en")).at(-1)!
    .timestamp;
}

/**
 * Performance snapshot for a single run id, or null if unknown.
 */
export async function getRunPerformance(runId: string): Promise<RunPerformanceModel | null> {
  const all = await loadPersistedListingRecords();
  const rows = all.filter((r) => r.traceRunId === runId);
  if (rows.length === 0) {
    return null;
  }
  return computeRunPerformance(rows);
}

/**
 * Most recent runs first (by max row timestamp per run), then {@link computeRunPerformance} each.
 */
export async function listRunPerformances(limit: number): Promise<RunPerformanceModel[]> {
  const all = await loadPersistedListingRecords();
  const byRun = groupRecordsByRunId(all);
  const runMeta = [...byRun.entries()].map(([runId, recs]) => ({
    runId,
    recs,
    sortKey: maxTimestampForRun(recs),
  }));
  runMeta.sort((x, y) => y.sortKey.localeCompare(x.sortKey, "en"));
  const take = Math.max(0, Math.floor(limit));
  return runMeta.slice(0, take).map(({ recs }) => computeRunPerformance(recs));
}

/**
 * Pairwise comparisons of the `n` most recent runs: index `i` compares run[i] vs run[i+1]
 * (each is newer vs older among adjacent runs in the latest-first list).
 */
export async function compareLatestRuns(n: number): Promise<RunComparison[]> {
  const performances = await listRunPerformances(n);
  const out: RunComparison[] = [];
  for (let i = 0; i < performances.length - 1; i++) {
    const newer = performances[i]!;
    const older = performances[i + 1]!;
    out.push(compareRuns(newer, older));
  }
  return out;
}

/** Namespace-style entry for run-level analytics (read-only). */
export const runPerformanceIndex = {
  getRunPerformance,
  listRunPerformances,
  compareLatestRuns,
};
