import type { CanonicalMarket, ListingItem } from "./types";
import { buildMarketplaceListings, type MarketplaceListing } from "./buildMarketplaceListings";
import { canonicalToListing } from "./canonicalToListing";
import { applyImagesToListings } from "./imageIngest";
import { groupListings } from "./groupListings";
import { resolveEpid, type EpidResolution } from "./resolveEpid";
import {
  runPipeline,
  validateMediaPipelineInput,
  type MediaPipelineInput,
} from "./run_pipeline";

export type MediaPipelineRunResult = {
  /** Primary output: eBay-style listing rows derived from canonical markets. */
  listings: ListingItem[];
  /** Grouped + deduped by `id` per group, sorted by `id` (keys deterministic). */
  grouped: ReturnType<typeof groupListings>;
  marketplaceListings: MarketplaceListing[];
  epidMap: EpidResolution[];
  pipeline: {
    markets: CanonicalMarket[];
  };
};

export async function runMediaPipeline(
  input: MediaPipelineInput
): Promise<MediaPipelineRunResult> {
  validateMediaPipelineInput(input);
  const pipelineResult = runPipeline(input);
  const listings: ListingItem[] = pipelineResult.pipeline.markets.map(canonicalToListing);
  let grouped = groupListings(listings);
  let marketplaceListings = buildMarketplaceListings(grouped);
  const listingsWithImages =
    input.imageFolders !== undefined
      ? applyImagesToListings(listings, [...input.imageFolders])
      : listings;
  grouped = groupListings(listingsWithImages);
  marketplaceListings = buildMarketplaceListings(grouped);
  const epidMap = await resolveEpid(marketplaceListings);
  return {
    listings: listingsWithImages,
    grouped,
    marketplaceListings,
    epidMap,
    pipeline: pipelineResult.pipeline,
  };
}

export type {
  ListingItem,
  CanonicalMarket,
  MediaPipelineInput,
  MarketplaceListing,
  EpidResolution,
};
export type { ImageFolder } from "./imageIngest";
export { applyImagesToListings } from "./imageIngest";
export { resolveEpid } from "./resolveEpid";
export { buildMarketplaceListings } from "./buildMarketplaceListings";
export { buildListingGroupKey } from "./buildListingGroupKey";
export { buildListingKey } from "./buildListingKey";
export { buildListingTitle } from "./buildListingTitle";
export { canonicalToListing } from "./canonicalToListing";
export { groupListings } from "./groupListings";
export type { GroupedListings } from "./groupListings";
export { runPipeline, validateMediaPipelineInput } from "./run_pipeline";

export type {
  RawScanResult,
  NormalizedInventoryItem,
  MediaAdapter,
} from "./types";
export { MediaAdapterImpl, simpleHash } from "./mediaAdapter";
export { scanBatchRawItems } from "./scanner";
export type { ScanBatchOptions } from "./scanner";
export { runBatch } from "./runBatch";
export type { RunBatchResult, RunBatchWithTraceResult } from "./runBatch";
export type {
  ExecutionTrace,
  ExecutionTraceEvent,
  ExecutionTraceEventKind,
} from "./executionTrace";
export { enrichWithEpid } from "./epidEnricher";
export type { EpidEnrichedInventoryItem } from "./epidEnricher";
export * as ebayMapper from "./ebayMapper";
export {
  toEbayInventoryItem,
  toEbayInventoryRequestBody,
} from "./ebayMapper";
export type {
  EbayInventoryItem,
  EbayInventoryProduct,
  EbayListingCondition,
} from "./ebayMapper";
export { executeBatchListings } from "./executeBatchListings";
export type {
  ExecutionResult,
  ExecuteBatchListingsResult,
  ExecuteBatchListingsInput,
} from "./executeBatchListings";
export {
  strategyAwareRun,
  selectListingStrategy,
  applyStrategyToItems,
  STRATEGY_PLACEHOLDER_BASE_PRICE,
  STRATEGY_SCORE_THRESHOLDS,
  tierFromListingQualityScore,
} from "./strategy";
export type {
  ListingStrategy,
  ListingStrategyInput,
  ListingMode,
  RetryPolicy,
  StrategySelectionContext,
  StrategyAwareRunResult,
} from "./strategy";
