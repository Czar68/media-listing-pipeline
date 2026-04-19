import { buildListingGroupKey } from "./buildListingGroupKey";
import type { ListingItem } from "./types";

export type GroupedListings = Record<string, ListingItem[]>;

export function groupListings(listings: readonly ListingItem[]): GroupedListings {
  const byKey = new Map<string, ListingItem[]>();
  for (const item of listings) {
    const key = buildListingGroupKey(item);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(item);
    else byKey.set(key, [item]);
  }

  const sortedKeys = Array.from(byKey.keys()).sort((a, b) => a.localeCompare(b));
  const result: GroupedListings = {};

  for (const groupKey of sortedKeys) {
    const items = byKey.get(groupKey) ?? [];
    const seen = new Set<string>();
    const deduped: ListingItem[] = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      deduped.push(item);
    }
    deduped.sort((x, y) => x.id.localeCompare(y.id));
    result[groupKey] = deduped;
  }

  return result;
}
