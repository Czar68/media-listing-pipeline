import type { ExecutionFailed, ExecutionResult, ExecutionSuccess } from "../execution/types";
import type { ExecutionTraceEvent } from "../executionTrace";

/**
 * In-memory run snapshot: listing rows and `trace` share references with {@link ExecutionResult}.
 */

export interface RunArtifact {
  readonly runId: string;
  readonly executionBatchId: string;
  readonly idempotencyKey: string;

  readonly summary: {
    readonly total: number;
    readonly successCount: number;
    readonly failureCount: number;
    /** `successCount / total`, or `0` when `total === 0`. */
    readonly successRate: number;
  };

  readonly listings: {
    readonly success: readonly ExecutionSuccess[];
    readonly failed: readonly ExecutionFailed[];
  };

  /** Same reference as {@link ExecutionResult.executionTrace}. */
  readonly trace: readonly ExecutionTraceEvent[];

  readonly metadata: {
    readonly mode: ExecutionResult["mode"];
    /** Deterministic epoch derived from {@link ExecutionResult.runId} (replay-stable). */
    readonly generatedAt: string;
  };
}
