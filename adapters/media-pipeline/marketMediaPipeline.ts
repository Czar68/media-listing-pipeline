import type { CanonicalMarket, ListingItem } from "./types";
import { buildMarketplaceListings, type MarketplaceListing } from "./buildMarketplaceListings";
import { canonicalToListing } from "./canonicalToListing";
import { applyImagesToListings } from "./imageIngest";
import { groupListings } from "./groupListings";
import { resolveEpid, type EpidResolution } from "./resolveEpid";
import { runPipeline, validateMediaPipelineInput, type MediaPipelineInput } from "./run_pipeline";

export type MediaPipelineRunResult = {
  readonly listings: ListingItem[];
  readonly grouped: ReturnType<typeof groupListings>;
  readonly marketplaceListings: MarketplaceListing[];
  readonly epidMap: EpidResolution[];
  readonly pipeline: {
    readonly markets: CanonicalMarket[];
  };
};

/**
 * Marketplace listing path: canonical markets → images → eBay-style rows → EPID resolution.
 * Distinct from the batch execution path (`run_pipeline` → `runBatch`).
 */
export async function runMediaPipeline(input: MediaPipelineInput): Promise<MediaPipelineRunResult> {
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
