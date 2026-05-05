import { createDeterministicRunStartedAt } from "../contracts/deterministicExecutionIdentity";
import type { ExecutionResult } from "../execution/types";
import type { ExecutionTrace } from "../executionTrace";
import type { RunArtifact } from "./runArtifactTypes";

/**
 * Parameters for {@link buildRunArtifact}.
 * Includes orchestration {@link ExecutionTrace} roots by reference so artifacts do not remap events.
 */
export type BuildRunArtifactInput = {
  readonly runId: string;
  readonly executionBatchId: string;
  readonly idempotencyKey: string;
  readonly result: ExecutionResult;
  readonly trace: readonly ExecutionTrace[];
};

/**
 * Pure, in-memory aggregation of run state for inspection, replay comparison, and auditing.
 */
export function buildRunArtifact(input: BuildRunArtifactInput): RunArtifact {
  const { runId, executionBatchId, idempotencyKey, result, trace } = input;
  const successCount = result.success.length;
  const failureCount = result.failed.length;
  const total = successCount + failureCount;
  const successRate = total === 0 ? 0 : successCount / total;

  return {
    runId,
    executionBatchId,
    idempotencyKey,
    summary: {
      total,
      successCount,
      failureCount,
      successRate,
    },
    listings: {
      success: result.success,
      failed: result.failed,
    },
    trace,
    metadata: {
      mode: result.mode,
      generatedAt: createDeterministicRunStartedAt(result.runId),
    },
  };
}
