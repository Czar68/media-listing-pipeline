import {
  toEbayInventoryItem,
  type EbayInventoryItem,
} from "./ebayMapper";
import type { NormalizedInventoryItem } from "./types";
import { EbayExecutor } from "./execution/ebayExecutor";
import { MockExecutor } from "./execution/mockExecutor";
import type { ListingExecutionAdapter } from "./execution/executor";
import type { ExecutionResult, ExecutionSuccess, ExecutionFailed, ExecutionError } from "./execution/types";

export type ExecuteBatchListingsInput =
  | readonly NormalizedInventoryItem[]
  | { readonly normalizedInventoryItems: readonly NormalizedInventoryItem[] };

function resolveNormalizedItems(input: ExecuteBatchListingsInput): NormalizedInventoryItem[] {
  if (
    typeof input === "object" &&
    input !== null &&
    "normalizedInventoryItems" in input &&
    !Array.isArray(input)
  ) {
    return [...(input as { readonly normalizedInventoryItems: readonly NormalizedInventoryItem[] }).normalizedInventoryItems];
  }
  return [...(input as readonly NormalizedInventoryItem[])];
}

/** Last-resort payload if {@link toEbayInventoryItem} throws (corrupt normalized row). */
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
 * Maps normalized items to eBay payloads and orchestrates per-item execution.
 * Executor handles SINGLE ITEM ONLY - this function handles orchestration and aggregation.
 * Each iteration is isolated; one failure does not abort the batch.
 */
export async function executeBatchListings(
  itemsOrResult: ExecuteBatchListingsInput
): Promise<ExecutionResult> {
  const items = resolveNormalizedItems(itemsOrResult);
  const executor: ListingExecutionAdapter =
    process.env.EXECUTION_MODE === "ebay"
      ? new EbayExecutor()
      : new MockExecutor();

  const success: ExecutionSuccess[] = [];
  const failed: ExecutionFailed[] = [];

  console.log("[EXECUTION MODE]");
  console.log(process.env.EXECUTION_MODE || "mock (default)");

  for (const item of items) {
    let ebayPayload: EbayInventoryItem;
    try {
      ebayPayload = toEbayInventoryItem(item);
    } catch (mapErr) {
      // Mapping failures are handled as failed entries
      const fallbackPayload = ebayPayloadForCorruptNormalizedItem(item);
      const error: ExecutionError = {
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

    // Execute single item
    const result = await executor.execute({ item, ebayPayload });

    // Aggregate results
    if ('error' in result) {
      failed.push(result as ExecutionFailed);
    } else {
      success.push(result as ExecutionSuccess);
    }
  }

  return { success, failed };
}
