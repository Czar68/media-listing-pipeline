import type { EpidEnrichedInventoryItem } from "./epidEnricher";
import type { NormalizedInventoryItem } from "./types";

/** eBay Sell Inventory API condition strings used by this mapper (subset). */
export type EbayListingCondition =
  | "NEW"
  | "USED_EXCELLENT"
  | "USED_VERY_GOOD"
  | "USED_GOOD"
  | "USED_ACCEPTABLE"
  | "FOR_PARTS_OR_NOT_WORKING";

export type EbayInventoryProduct = {
  title: string;
  description: string;
  /** eBay `product.imageUrls` — typically HTTPS URLs. */
  imageUrls: string[];
};

/**
 * eBay-oriented inventory row: API body fields plus audit metadata (not all sent verbatim to eBay).
 */
export type EbayInventoryItem = {
  sku: string;
  condition: EbayListingCondition;
  product: EbayInventoryProduct;
  sourceMetadata: {
    system: string;
    origin: string;
    externalId?: string;
    capturedAt: string;
    normalizedAt: string;
    category?: string;
    /** Present when {@link enrichWithEpid} matched a catalog product. */
    epid?: string;
    matchConfidence?: number;
    /** Disc image paths from source manifest, passed through to executor. */
    imagePaths?: readonly string[];
    ebayConditionId?: number;
  };
};

function mapCondition(
  condition: NormalizedInventoryItem["condition"]
): EbayListingCondition {
  if (condition === "NEW") return "NEW";
  return "USED_ACCEPTABLE";
}

/**
 * Pure mapping: normalized inventory → eBay inventory shape (no I/O).
 * `UNSPECIFIED` → `NEW` (temporary safe default).
 * Accepts {@link EpidEnrichedInventoryItem} to surface optional EPID metadata only in `sourceMetadata`.
 */
export function toEbayInventoryItem(item: NormalizedInventoryItem): EbayInventoryItem {
  const enriched = item as NormalizedInventoryItem & Partial<EpidEnrichedInventoryItem>;
  return {
    sku: item.sku,
    condition: mapCondition(item.condition),
    product: {
      title: item.title,
      description: item.description,
      imageUrls: [...item.media.images],
    },
    sourceMetadata: {
      system: item.source.system,
      origin: item.source.origin,
      externalId: item.source.externalId,
      capturedAt: item.timestamps.capturedAt,
      normalizedAt: item.timestamps.normalizedAt,
      category: item.category,
      ...(enriched.epid !== undefined ? { epid: enriched.epid } : {}),
      ...(enriched.matchConfidence !== undefined
        ? { matchConfidence: enriched.matchConfidence }
        : {}),
      ...(Array.isArray((item.metadata as Record<string, unknown>)?.imagePaths)
        ? { imagePaths: (item.metadata as Record<string, unknown>).imagePaths as string[] }
        : {}),
      ...(typeof (item.metadata as Record<string, unknown>)?.ebayConditionId === 'number'
        ? { ebayConditionId: (item.metadata as Record<string, unknown>).ebayConditionId as number }
        : {}),
    },
  };
}

/** Payload for `PUT /sell/inventory/v1/inventory_item/{sku}` (eBay-compatible fields only). */
export function toEbayInventoryRequestBody(
  item: EbayInventoryItem
): { condition: EbayListingCondition; product: EbayInventoryProduct } {
  return {
    condition: item.condition,
    product: item.product,
  };
}
