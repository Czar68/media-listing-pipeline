import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import { toEbayInventoryItem } from "../ebayMapper";
import type { CanonicalExecutionListing } from "./pipelineStageContracts";

/**
 * Deterministic, side-effect-free projection from enriched inventory to the canonical execution listing.
 * All execution listing payloads MUST flow through this function (single mapping entrypoint).
 */
export function toCanonicalExecutionListing(enriched: EpidEnrichedInventoryItem): CanonicalExecutionListing {
  return toEbayInventoryItem(enriched);
}
