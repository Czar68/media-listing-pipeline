import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import type { EbayInventoryItem } from "../ebayMapper";

export type { IngestItem, NormalizedInventoryItem } from "../types";

/** EPID-enriched row after the enrich stage (canonical projection or catalog enrich). */
export type EnrichedInventoryItem = EpidEnrichedInventoryItem;

/**
 * Listing payload at the enrich → execution boundary in `runBatch` (eBay inventory item shape).
 * Distinct from marketplace `ListingItem` in `types.ts` (canonical listing / grouping model).
 */
export type ExecutionListingItem = EbayInventoryItem;

/** One validated row passed to the batch execution layer (inventory + listing payload). */
export interface ExecutionInput {
  readonly item: EnrichedInventoryItem;
  readonly listing: ExecutionListingItem;
}

export type { ExecutionResult } from "../execution/types";

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
