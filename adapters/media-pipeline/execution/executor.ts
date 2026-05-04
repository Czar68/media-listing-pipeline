import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';
import type { ExecutionSuccess, ExecutionFailed, ExecutionResult } from './types';

/**
 * Execution interface for listing adapters
 * Allows swapping between real implementations (eBay) and mock implementations
 * Executors handle SINGLE ITEM ONLY - no batch responsibility
 * Returns per-item result (success or failed)
 */

/** Batch boundary: map+execute aggregation for a set of normalized listing rows. */
export interface BatchListingExecutor {
  execute(listings: readonly NormalizedInventoryItem[]): Promise<ExecutionResult>;
}

export interface ListingExecutionAdapter {
  /**
   * Execute the full listing workflow for a SINGLE item
   * Returns normalized per-item result (success or failed)
   */
  execute(input: {
    item: NormalizedInventoryItem;
    ebayPayload: EbayInventoryItem;
  }): Promise<ExecutionSuccess | ExecutionFailed>;
}
