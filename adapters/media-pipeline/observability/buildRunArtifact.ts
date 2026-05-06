import { createDeterministicRunStartedAt } from "../contracts/deterministicExecutionIdentity";
import type { ExecutionResult } from "../execution/types";
import type { RunArtifact } from "./runArtifactTypes";

/** Parameters for {@link buildRunArtifact}. */
export type BuildRunArtifactInput = {
  readonly runId: string;
  readonly executionBatchId: string;
  readonly idempotencyKey: string;
  readonly result: ExecutionResult;
};

/**
 * Pure, in-memory aggregation of run state for inspection, replay comparison, and auditing.
 */
export function buildRunArtifact(input: BuildRunArtifactInput): RunArtifact {
  const { runId, executionBatchId, idempotencyKey, result } = input;
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
    trace: result.executionTrace,
    metadata: {
      mode: result.mode,
      generatedAt: createDeterministicRunStartedAt(result.runId),
    },
  };
}
