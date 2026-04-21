import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import type { NormalizedInventoryItem } from "../types";
import type { ListingQualityScore } from "../validation/validationScoringTypes";

export type ListingMode = "safe" | "balanced" | "aggressive";
export type RetryPolicy = "strict" | "normal";

/**
 * Actionable listing decisions derived from quality signals (advisory metadata + trace;
 * executor and EPID pipeline behavior unchanged unless future hooks consume this).
 */
export interface ListingStrategy {
  readonly strategyId: string;
  readonly pricing: {
    /** Placeholder list price; downstream pricing engines may override. */
    readonly basePrice: number;
    /** Multiplier applied to base (quality + EPID-derived). */
    readonly adjustmentFactor: number;
  };
  readonly executionConfig: {
    /** Intended EPID usage (recorded in metadata; pipeline EPID fetch still follows env in runBatch). */
    readonly enableEPID: boolean;
    readonly retryPolicy: RetryPolicy;
    readonly listingMode: ListingMode;
  };
}

export interface ListingStrategyInput {
  readonly item: NormalizedInventoryItem;
  readonly enriched?: Partial<EpidEnrichedInventoryItem>;
  readonly listingQualityScore?: ListingQualityScore;
}

export interface StrategySelectionContext {
  /** Per-SKU scores from the listing-quality layer (optional). */
  readonly qualityScoreBySku?: Readonly<Record<string, ListingQualityScore>>;
  /** Used when no per-SKU score is present. */
  readonly defaultQualityScore?: ListingQualityScore;
  /** Optional pre-known EPID enrichment by SKU (e.g. warm cache / tests). */
  readonly enrichedBySku?: Readonly<Record<string, Partial<EpidEnrichedInventoryItem>>>;
}
