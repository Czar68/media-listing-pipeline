import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import type { EbayInventoryItem } from "../ebayMapper";

export type { IngestItem, NormalizedInventoryItem } from "../types";

/** EPID-enriched row after the enrich stage (canonical projection or catalog enrich). */
export type EnrichedInventoryItem = EpidEnrichedInventoryItem;

/**
 * Single canonical pre-execution listing payload for `runBatch` → executor.
 * Structural match to `EbayInventoryItem`; distinct from marketplace `ListingItem` in `types.ts`.
 */
export type CanonicalExecutionListing = EbayInventoryItem;

/** @deprecated Use {@link CanonicalExecutionListing}; retained as an alias for frozen Phase 2 validators. */
export type ExecutionListingItem = CanonicalExecutionListing;

/** One validated row passed to the batch execution layer (inventory + listing payload). */
export interface ExecutionInput {
  readonly item: EnrichedInventoryItem;
  readonly listing: CanonicalExecutionListing;
}

export type { ExecutionResult } from "../execution/types";
export type { ExecutionMode, PipelineExecutionPhaseMode } from "./environmentGuard";

export type PipelineStageValidationDetail = {
  readonly stage: string;
  readonly error: string;
  readonly payload: unknown;
};

export class PipelineStageValidationError extends Error {
  readonly detail: Readonly<PipelineStageValidationDetail>;

  constructor(detail: PipelineStageValidationDetail) {
    super(`[${detail.stage}] ${detail.error}`);
    this.name = "PipelineStageValidationError";
    this.detail = Object.freeze({ ...detail });
  }
}
