import { buildListingTitle } from "./buildListingTitle";
import type { ListingItem } from "./types";

export type MarketplaceListing = {
  groupKey: string;
  title: string;
  items: ListingItem[];
  itemCount: number;
};

export function buildMarketplaceListings(
  grouped: Record<string, ListingItem[]>
): MarketplaceListing[] {
  return Object.entries(grouped).map(([groupKey, items]) => ({
    groupKey,
    title: buildListingTitle(items[0] as any),
    items,
    itemCount: items.length,
  }));
}
