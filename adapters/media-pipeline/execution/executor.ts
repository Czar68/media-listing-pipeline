import type { ExecutionSuccess, ExecutionFailed, ExecutionOutcome } from './types';
import type { CanonicalExecutionListing } from '../contracts/pipelineStageContracts';

/**
 * Execution interface for listing adapters
 * Allows swapping between real implementations (eBay) and mock implementations
 * Executors handle SINGLE ITEM ONLY - no batch responsibility
 * Returns per-item result (success or failed)
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
