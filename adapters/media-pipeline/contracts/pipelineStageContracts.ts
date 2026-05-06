/**
 * @file Contract map: each exported type points at a single canonical definition (no parallel aliases).
 *
 * - `IngestItem` / `NormalizedInventoryItem` → `../types`
 * - `CanonicalExecutionListing` → same structural type as `../ebayMapper.EbayInventoryItem` (semantic name for execution payloads)
 * - `ExecutionResult` → `../execution/types`
 * - `ExecutionMode` → `./environmentGuard`
 * - `ProductionUnlockConfig` / `ProductionGuardError` → `./productionGuard`
 */
import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import type { EbayInventoryItem } from "../ebayMapper";

export type { IngestItem, NormalizedInventoryItem } from "../types";

/** EPID-enriched row after the enrich stage (canonical projection or catalog enrich). */
export type EnrichedInventoryItem = EpidEnrichedInventoryItem;

/** Pre-execution listing row for `runBatch` → mock executor; structural alias of `EbayInventoryItem`. */
export type CanonicalExecutionListing = EbayInventoryItem;

/** One validated row passed to the batch execution layer (inventory + listing payload). */
export interface ExecutionInput {
  readonly item: EnrichedInventoryItem;
  readonly listing: CanonicalExecutionListing;
}

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
