import type { ExecutionResult } from "./execution/types";

export type ExecutionTraceEventKind =
  | "TRACE_SCAN"
  | "TRACE_NORMALIZE"
  | "TRACE_EXECUTE"
  | "TRACE_ERROR"
  | "TRACE_RECOVERY"
  /** Pre-execution listing strategy chosen per SKU (strategy layer; does not change executor). */
  | "TRACE_STRATEGY";

export interface ExecutionTraceEvent {
  readonly kind: ExecutionTraceEventKind;
  readonly timestamp: string;
  readonly runId: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ExecutionTrace {
  readonly runId: string;
  /** ISO-8601 timestamp when the run started (same clock as event timestamps). */
  readonly timestamp: string;
  /** Aggregated execution outcomes for this run (one entry per completed batch execution). */
  readonly items: readonly ExecutionResult[];
  readonly summary: {
    readonly successCount: number;
    readonly failedCount: number;
    readonly recoveredCount: number;
  };
  /** Chronological orchestration-level trace events for this run. */
  readonly events: readonly ExecutionTraceEvent[];
}

export function createTraceEvent(
  kind: ExecutionTraceEventKind,
  runId: string,
  payload?: Readonly<Record<string, unknown>>
): ExecutionTraceEvent {
  return {
    kind,
    timestamp: new Date().toISOString(),
    runId,
    ...(payload !== undefined ? { payload } : {}),
  };
}

export function countRecoveredInExecution(execution: ExecutionResult): number {
  let n = 0;
  for (const s of execution.success) {
    if (s.recovered === true) n += 1;
  }
  for (const f of execution.failed) {
    if (f.recovered === true) n += 1;
  }
  return n;
}

export function buildExecutionTrace(params: {
  readonly runId: string;
  readonly runStartedAt: string;
  readonly execution: ExecutionResult;
  readonly events: readonly ExecutionTraceEvent[];
}): ExecutionTrace {
  const recoveredCount = countRecoveredInExecution(params.execution);
  return {
    runId: params.runId,
    timestamp: params.runStartedAt,
    items: [params.execution],
    summary: {
      successCount: params.execution.success.length,
      failedCount: params.execution.failed.length,
      recoveredCount,
    },
    events: params.events,
  };
}
