import type { ListingItem } from "./types";

export type ImageFolder = {
  sku: string;
  imageUrls: string[];
};

export function applyImagesToListings(
  listings: ListingItem[],
  folders: ImageFolder[]
): ListingItem[] {
  const map = new Map(folders.map((f) => [f.sku, f.imageUrls]));

  return listings.map((item) => ({
    ...item,
    images: map.get(item.id) ?? [],
  }));
}
