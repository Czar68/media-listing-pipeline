import type { CanonicalMarket } from "./types";

/** Builds the listing SKU (`ListingItem.id`). Sole stable identity string for the pipeline. */
export function buildListingKey(m: CanonicalMarket): string {
  const meta = m.metadata ?? {};

  return [
    m.eventId,
    m.marketId,
    meta.playerName,
    meta.statType,
    meta.marketType,
    meta.selectionSide,
  ]
    .map((v) => (v ?? "").toString().trim().toLowerCase())
    .join("|");
}
