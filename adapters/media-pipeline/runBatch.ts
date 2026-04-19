import { executeBatchListings, type ExecutionResult } from "./executeBatchListings";
import {
  enrichWithEpid,
  type EpidEnrichedInventoryItem,
} from "./epidEnricher";
import { MediaAdapterImpl } from "./mediaAdapter";
import { scanBatchRawItems, type ScanBatchOptions } from "./scanner";
import type { NormalizedInventoryItem, RawScanResult } from "./types";

/**
 * Single pipeline contract: scan → normalize → EPID enrichment (optional) → map+execute.
 */
export type RunBatchResult = {
  readonly rawScanResults: RawScanResult[];
  readonly normalizedInventoryItems: NormalizedInventoryItem[];
  readonly enrichedInventoryItems: EpidEnrichedInventoryItem[];
  readonly execution: ExecutionResult;
};

/**
 * Strict order: scan → normalize → {@link enrichWithEpid} (parallel, order-preserving) → {@link executeBatchListings}.
 */
export async function runBatch(
  items: readonly unknown[],
  scanOptions?: ScanBatchOptions
): Promise<RunBatchResult> {
  const adapter = new MediaAdapterImpl();

  const rawScanResults: RawScanResult[] = scanBatchRawItems(items, scanOptions);

  const normalizedInventoryItems: NormalizedInventoryItem[] = [];
  for (const raw of rawScanResults) {
    normalizedInventoryItems.push(adapter.normalize(raw));
  }

  const enrichedInventoryItems: EpidEnrichedInventoryItem[] = await Promise.all(
    normalizedInventoryItems.map((row) => enrichWithEpid(row))
  );

  const execution: ExecutionResult = await executeBatchListings(enrichedInventoryItems);

  return {
    rawScanResults,
    normalizedInventoryItems,
    enrichedInventoryItems,
    execution,
  };
}
