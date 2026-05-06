import type { ExecutionSuccess, ExecutionFailed, ExecutionOutcome } from './types';
import type { CanonicalExecutionListing } from '../contracts/pipelineStageContracts';

/**
 * Mock-only listing execution: single-item adapters and batch aggregation for canonical listings.
 * Per-item executors return success or failed rows only.
 */

/** Batch boundary: map+execute aggregation for canonical pre-execution listings. */
export interface BatchListingExecutor {
  execute(listings: readonly CanonicalExecutionListing[]): Promise<ExecutionOutcome>;
}

export interface ListingExecutionAdapter {
  /**
   * Execute the full listing workflow for a SINGLE canonical listing payload.
   * Returns normalized per-item result (success or failed)
   */
  execute(input: { listing: CanonicalExecutionListing }): Promise<ExecutionSuccess | ExecutionFailed>;
}
