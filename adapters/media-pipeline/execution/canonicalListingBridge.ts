import type { CanonicalExecutionListing } from "../contracts/pipelineStageContracts";
import type { NormalizedInventoryItem } from "../types";

/**
 * Reconstructs a {@link NormalizedInventoryItem} view from a canonical listing for execution results only.
 * Inverse of {@link toCanonicalExecutionListing} field mapping — no I/O, no defaults beyond structural mapping.
 */
export function normalizedInventoryItemFromCanonicalListing(
  listing: CanonicalExecutionListing
): NormalizedInventoryItem {
  const condition: NormalizedInventoryItem["condition"] =
    listing.condition === "USED" ? "USED" : listing.condition === "NEW" ? "NEW" : "UNSPECIFIED";

  const meta: Record<string, unknown> | undefined =
    listing.sourceMetadata.epid !== undefined || listing.sourceMetadata.matchConfidence !== undefined
      ? {
          ...(listing.sourceMetadata.epid !== undefined ? { epid: listing.sourceMetadata.epid } : {}),
          ...(listing.sourceMetadata.matchConfidence !== undefined
            ? { matchConfidence: listing.sourceMetadata.matchConfidence }
            : {}),
        }
      : undefined;

  return {
    sku: listing.sku,
    title: listing.product.title,
    description: listing.product.description,
    media: { images: [...listing.product.imageUrls], videos: [] },
    condition,
    source: {
      system: "media-listing-pipeline",
      origin: listing.sourceMetadata.origin,
      ...(listing.sourceMetadata.externalId !== undefined
        ? { externalId: listing.sourceMetadata.externalId }
        : {}),
    },
    timestamps: {
      capturedAt: listing.sourceMetadata.capturedAt,
      normalizedAt: listing.sourceMetadata.normalizedAt,
    },
    ...(listing.sourceMetadata.category !== undefined ? { category: listing.sourceMetadata.category } : {}),
    ...(meta !== undefined && Object.keys(meta).length > 0 ? { metadata: meta } : {}),
  };
}
