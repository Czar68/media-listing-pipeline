import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';
import type { ExecutionMode } from '../contracts/environmentGuard';

/**
 * Strict execution result contract shared by all executors
 * Ensures mock and (historical) production executor rows share the same result shapes.
 */

export type ErrorType = 
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'SANDBOX_LIMITATION'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ExecutionError {
  type: ErrorType;
  message: string;
  code?: string | number;
  raw?: unknown;
}

/**
 * Structured outcome of the publish step for a single offer.
 * Always present on ExecutionSuccess; present on ExecutionFailed only when
 * inventory + offer creation succeeded but publishOffer itself failed.
 */
export interface PublishResult {
  readonly offerId: string;
  readonly status: 'PUBLISHED' | 'FAILED';
  readonly httpStatus: number;
  /** eBay marketplace listingId returned by the publish endpoint on success. */
  readonly listingId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface ExecutionSuccess {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  response: {
    status?: number;
    data?: unknown;
  };
  /** Structured outcome of the publish step. Always set on success paths. */
  publishResult: PublishResult;
  /** Deterministic listing-level id from {@link createListingExecutionId} (applied in `runBatch`). */
  executionId?: string;
  recovered?: boolean;
  retryCount?: number;
}

export interface ExecutionFailed {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  error: ExecutionError;
  executionId?: string;
  /**
   * Present when failure occurred at or after the publish step.
   * Absent when failure occurred during inventory PUT or offer POST.
   */
  publishResult?: PublishResult;
  recovered?: boolean;
  retryCount?: number;
}

/** Raw outcome from mock batch executor (`success`/`failed` only). */
export type ExecutionOutcome = {
  success: ExecutionSuccess[];
  failed: ExecutionFailed[];
};

/**
 * Completed batch execution with deterministic identity fields (replay-comparable).
 * `listings` is the canonical snapshot passed to execution; `executionTrace` mirrors trace events.
 */
export interface ExecutionResult extends ExecutionOutcome {
  readonly runId: string;
  readonly executionBatchId: string;
  readonly idempotencyKey: string;
  readonly mode: Exclude<ExecutionMode, "blocked">;
  /** True when {@link ExecutionOutcome.failed} is empty. */
  readonly batchSucceeded: boolean;
  readonly listings: readonly EbayInventoryItem[];
  readonly executionTrace: readonly import("../executionTrace").ExecutionTraceEvent[];
}
