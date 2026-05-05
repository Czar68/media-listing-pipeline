import type { ExecutionFailed, ExecutionResult, ExecutionSuccess } from "../execution/types";
import type { ExecutionTrace } from "../executionTrace";

/**
 * Replay-comparable structured snapshot for a completed batch run (Phase 6).
 *
 * Listing rows reuse the same array references as {@link ExecutionResult.success} / `.failed`;
 * orchestration traces reuse the supplied {@link ExecutionTrace} roots (no cloning).
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

  readonly trace: readonly ExecutionTrace[];

  readonly metadata: {
    readonly mode: ExecutionResult["mode"];
    /** Deterministic epoch derived from {@link ExecutionResult.runId} (replay-stable). */
    readonly generatedAt: string;
  };
}
