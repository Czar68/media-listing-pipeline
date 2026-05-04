import { toEbayInventoryItem, type EbayInventoryItem } from "../ebayMapper";
import type { NormalizedInventoryItem } from "../types";
import type { BatchListingExecutor, ListingExecutionAdapter } from "./executor";
import { MockExecutor } from "./mockExecutor";
import type {
  ExecutionResult,
  ExecutionSuccess,
  ExecutionFailed,
  ExecutionError,
} from "./types";

/** Historical name — same as {@link ExecutionResult}; batch execution is mock-only via `runBatch`. */
export type ExecuteBatchListingsResult = ExecutionResult;

export type ExecuteBatchListingsInput =
  | readonly NormalizedInventoryItem[]
  | { readonly normalizedInventoryItems: readonly NormalizedInventoryItem[] };

function ebayPayloadForCorruptNormalizedItem(item: NormalizedInventoryItem): EbayInventoryItem {
  return {
    sku: String(item?.sku ?? "unknown"),
    condition: "NEW",
    product: {
      title: String(item?.title ?? ""),
      description: String(item?.description ?? ""),
      imageUrls: Array.isArray(item?.media?.images) ? [...item.media.images] : [],
    },
    sourceMetadata: {
      system: item?.source?.system ?? "media-listing-pipeline",
      origin: String(item?.source?.origin ?? ""),
      externalId: item?.source?.externalId,
      capturedAt: String(item?.timestamps?.capturedAt ?? ""),
      normalizedAt: String(item?.timestamps?.normalizedAt ?? ""),
      category: item?.category,
    },
  };
}

/**
 * Batch orchestration over {@link ListingExecutionAdapter} (single-item contract).
 * Sole active path: {@link MockExecutor} only (no production executor module).
 */
class MockOnlyBatchListingExecutor implements BatchListingExecutor {
  constructor(private readonly singleItemExecutor: ListingExecutionAdapter) {}

  async execute(listings: readonly NormalizedInventoryItem[]): Promise<ExecutionResult> {
    const success: ExecutionSuccess[] = [];
    const failed: ExecutionFailed[] = [];

    for (const item of listings) {
      let ebayPayload: EbayInventoryItem;
      try {
        ebayPayload = toEbayInventoryItem(item);
      } catch (mapErr) {
        const fallbackPayload = ebayPayloadForCorruptNormalizedItem(item);
        const error: ExecutionError = {
          type: "UNKNOWN",
          message: mapErr instanceof Error ? mapErr.message : String(mapErr),
          raw: mapErr,
        };
        failed.push({
          item,
          ebayPayload: fallbackPayload,
          error,
        });
        continue;
      }

      const result = await this.singleItemExecutor.execute({ item, ebayPayload });
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
  return new MockOnlyBatchListingExecutor(new MockExecutor());
}

/**
 * Runs the listing batch through the mock-only {@link BatchListingExecutor} boundary.
 */
export function executeListingsWithMockBatchExecutor(
  listings: readonly NormalizedInventoryItem[]
): Promise<ExecutionResult> {
  return createMockOnlyBatchListingExecutor().execute(listings);
}
