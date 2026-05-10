/**
 * Batch listing execution via a pluggable single-item executor (mock or sandbox eBay client).
 * Completed {@link import("./types").ExecutionResult} is assembled in `runBatch`.
 */
import type { CanonicalExecutionListing } from "../contracts/pipelineStageContracts";
import type { BatchListingExecutor, ListingExecutionAdapter } from "./executor";
import { resolveListingExecutorPort } from "./pluggableExecutor";
import type { ExecutionOutcome, ExecutionSuccess, ExecutionFailed } from "./types";

export type ExecuteBatchListingsInput =
  | readonly CanonicalExecutionListing[]
  | { readonly canonicalExecutionListings: readonly CanonicalExecutionListing[] };

function resolveCanonicalListings(input: ExecuteBatchListingsInput): CanonicalExecutionListing[] {
  if (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    "canonicalExecutionListings" in input
  ) {
    return [
      ...(input as { readonly canonicalExecutionListings: readonly CanonicalExecutionListing[] })
        .canonicalExecutionListings,
    ];
  }
  return [...(input as readonly CanonicalExecutionListing[])];
}

/** Batch orchestration over {@link ListingExecutionAdapter} (single-item executor port). */
class MockOnlyBatchListingExecutor implements BatchListingExecutor {
  constructor(private readonly singleItemExecutor: ListingExecutionAdapter) {}

  async execute(listings: readonly CanonicalExecutionListing[]): Promise<ExecutionOutcome> {
    const success: ExecutionSuccess[] = [];
    const failed: ExecutionFailed[] = [];

    for (const listing of listings) {
      const result = await this.singleItemExecutor.execute(listing);
      if ("error" in result) {
        failed.push(result as ExecutionFailed);
      } else {
        success.push(result as ExecutionSuccess);
      }
    }

    return { success, failed };
  }
}

export function createMockOnlyBatchListingExecutor(): BatchListingExecutor {
  return new MockOnlyBatchListingExecutor(resolveListingExecutorPort());
}

/**
 * Runs the listing batch through {@link BatchListingExecutor} → pluggable executor.
 */
export function executeListingsWithMockBatchExecutor(
  listings: ExecuteBatchListingsInput
): Promise<ExecutionOutcome> {
  return createMockOnlyBatchListingExecutor().execute(resolveCanonicalListings(listings));
}
