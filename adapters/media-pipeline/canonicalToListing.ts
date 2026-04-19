import { buildListingKey } from "./buildListingKey";
import { buildListingTitle } from "./buildListingTitle";
import type { CanonicalMarket, ListingItem } from "./types";

export function canonicalToListing(market: CanonicalMarket): ListingItem {
  return {
    id: buildListingKey(market),
    title: buildListingTitle(market),
    subtitle: market.subtitle,
    category: market.category,
    price: market.price,
    condition: market.condition,
    source: market.source,
    eventId: market.eventId,
    marketId: market.marketId,
    images: market.metadata?.images ?? [],
    metadata: { ...market.metadata },
  };
}
