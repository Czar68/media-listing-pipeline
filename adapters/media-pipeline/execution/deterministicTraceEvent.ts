import type { ExecutionTraceEvent, ExecutionTraceEventKind } from "../executionTrace";

const EPOCH_ANCHOR_MS = Date.UTC(2000, 0, 1, 0, 0, 0, 0);

/**
 * Deterministic trace event: monotonic synthetic timestamps per sequence, stable payloads.
 */
export function createDeterministicTraceEvent(
  sequence: number,
  kind: ExecutionTraceEventKind,
  runId: string,
  payload?: Readonly<Record<string, unknown>>,
  listingExecutionId?: string
): ExecutionTraceEvent {
  const timestamp = new Date(EPOCH_ANCHOR_MS + sequence * 1000).toISOString();
  const mergedPayload =
    listingExecutionId !== undefined
      ? { ...(payload ?? {}), executionId: listingExecutionId }
      : payload;
  const hasPayload =
    mergedPayload !== undefined && Object.keys(mergedPayload).length > 0;
  return {
    kind,
    timestamp,
    runId,
    ...(hasPayload ? { payload: mergedPayload } : {}),
  };
}
