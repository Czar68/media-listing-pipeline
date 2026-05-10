import type { ExecutionOutcome } from "./types";
import type { CanonicalExecutionListing } from "../contracts/pipelineStageContracts";
export type { ListingExecutorPort } from "./ports/listingExecutorPort";
import type { ListingExecutorPort } from "./ports/listingExecutorPort";

/**
 * Alias for legacy references; canonical name is {@link ListingExecutorPort}.
 */
export type ListingExecutionAdapter = ListingExecutorPort;

/** Batch boundary: map+execute aggregation for canonical pre-execution listings. */
export interface BatchListingExecutor {
  execute(listings: readonly CanonicalExecutionListing[]): Promise<ExecutionOutcome>;
}
