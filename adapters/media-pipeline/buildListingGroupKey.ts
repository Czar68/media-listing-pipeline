import type { ListingItem } from "./types";

/**
 * Grouping key derived only from the listing SKU (`item.id`), not a separate identity scheme.
 * Slices the pipe-delimited SKU from `buildListingKey`.
 */
export function buildListingGroupKey(item: ListingItem): string {
  return item.id
    .split("|")
    .slice(0, 3) // eventId + marketId + player/stat core
    .join("|");
}
