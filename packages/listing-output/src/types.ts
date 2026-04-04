import type { PublishableListingPayload } from '@media-listing/listing-assembly';

export type ListingOutputInput = PublishableListingPayload;

/**
 * Deterministic listing output boundary for downstream publication consumers.
 * Preserves the publishable listing from listing-assembly; publication-only
 * fields that cannot be derived upstream are explicit null placeholders.
 */
export type ListingOutputResult = {
  readonly publishableListing: PublishableListingPayload;
  /** Not produced by listing-assembly; assigned after marketplace listing create. */
  readonly marketplaceAssignedIdentifiers: null;
  /** Not produced by listing-assembly; routing and delivery metadata for publication. */
  readonly publicationDeliveryMetadata: null;
};
