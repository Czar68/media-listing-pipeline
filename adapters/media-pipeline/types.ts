/**
 * Identity model (media pipeline)
 *
 * SKU is the canonical identity key for:
 * - grouping
 * - image folder mapping
 * - marketplace export
 * - deduplication logic
 *
 * In this adapter, `ListingItem.id` is that SKU: it is produced exclusively by
 * `buildListingKey` from canonical market fields. No secondary identifier should be
 * introduced for identity resolution downstream.
 *
 * Group keys and other derived keys must be computed only from this SKU (or the
 * same canonical inputs that `buildListingKey` uses), never from a parallel identity.
 */
export interface ListingItem {
  /**
   * SKU — stable identity from `buildListingKey` (same logical market → same value).
   * Used for deduplication, grouping, image folder binding (`ImageFolder.sku`), and export.
   */
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  price?: number;
  condition?: "new" | "used" | "refurbished";
  source: string;
  eventId: string;
  marketId: string;
  images?: string[];
  metadata: {
    playerName?: string;
    statType?: string;
    marketType?: string;
    selectionSide?: string;
    images?: string[];
  };
}

/** Canonical market row before marketplace-specific listing formatting. */
export interface CanonicalMarket {
  title: string;
  subtitle?: string;
  category: string;
  price?: number;
  condition?: "new" | "used" | "refurbished";
  source: string;
  eventId: string;
  marketId: string;
  metadata?: ListingItem["metadata"];
}
