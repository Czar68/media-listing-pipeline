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

/** Raw scanner output — ingestion only; no trimming, SKU, or marketplace fields. */
export interface RawScanResult {
  source: string;
  externalId?: string;
  title: string;
  description?: string;
  mediaType: "image" | "video" | "audio" | "unknown";
  files: string[];
  metadata?: Record<string, unknown>;
  capturedAt: string;
}

/** Scanner / ingest stage row (alias of {@link RawScanResult}). */
export type IngestItem = RawScanResult;

/** Normalized inventory row produced only by {@link MediaAdapter}. */
export interface NormalizedInventoryItem {
  sku: string;
  title: string;
  description: string;
  media: {
    images: string[];
    videos: string[];
  };
  category?: string;
  condition: "NEW" | "USED" | "UNSPECIFIED";
  source: {
    system: "media-listing-pipeline";
    origin: string;
    externalId?: string;
  };
  timestamps: {
    capturedAt: string;
    normalizedAt: string;
  };
  metadata?: Record<string, unknown>;
}

/** Sole transformation boundary from {@link RawScanResult} to {@link NormalizedInventoryItem}. */
export interface MediaAdapter {
  normalize(input: RawScanResult): NormalizedInventoryItem;
}
