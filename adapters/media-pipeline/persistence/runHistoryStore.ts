import type { FinalListingRecord } from "../finalization/finalListingRecord";
import {
  computeRunPerformance,
  groupRecordsByRunId,
  type RunPerformanceModel,
} from "../intelligence/runPerformanceModel";

/**
 * One logical run (all SKUs sharing a traceRunId), suitable for dashboards and history UIs.
 */
export interface RunHistoryEntry {
  readonly runId: string;
  readonly traceRunId: string;
  readonly itemCount: number;
  readonly firstTimestamp: string;
  readonly lastTimestamp: string;
  /** Present when {@link BuildRunHistoryOptions.attachRunPerformanceModel} is true. */
  readonly runPerformanceModel?: RunPerformanceModel;
}

export interface BuildRunHistoryOptions {
  readonly attachRunPerformanceModel?: boolean;
}

function minTimestampForRun(records: readonly FinalListingRecord[]): string {
  if (records.length === 0) {
    return "";
  }
  return [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp, "en"))[0]!.timestamp;
}

function maxTimestampForRun(records: readonly FinalListingRecord[]): string {
  if (records.length === 0) {
    return "";
  }
  return [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp, "en")).at(-1)!
    .timestamp;
}

/**
 * Pure, read-only: groups persisted rows by run and optionally attaches {@link RunPerformanceModel}.
 * Does not read or write files; pass `records` from {@link loadPersistedListingRecords} or tests.
 */
export function buildRunHistoryEntries(
  records: readonly FinalListingRecord[],
  options?: BuildRunHistoryOptions
): readonly RunHistoryEntry[] {
  const byRun = groupRecordsByRunId(records);
  const attach = options?.attachRunPerformanceModel === true;
  const entries: RunHistoryEntry[] = [];

  const runIds = [...byRun.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const traceRunId of runIds) {
    const recs = byRun.get(traceRunId)!;
    const itemCount = recs.length;
    const firstTimestamp = minTimestampForRun(recs);
    const lastTimestamp = maxTimestampForRun(recs);
    const base: RunHistoryEntry = {
      runId: traceRunId,
      traceRunId,
      itemCount,
      firstTimestamp,
      lastTimestamp,
    };
    entries.push(
      attach
        ? {
            ...base,
            runPerformanceModel: computeRunPerformance(recs),
          }
        : base
    );
  }

  entries.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp, "en"));
  return entries;
}
