import type { PreparedListingCatalogMatchDraft } from '@media-listing/listing-preparation';

/**
 * Publishable listing payload at the listing-assembly boundary.
 * Fields align with prepared listing: only upstream-resolved catalog matches carry data;
 * other dimensions are explicit null or empty array where structurally required.
 */
export type PublishableListingPayload = {
  readonly catalogMatches: readonly PreparedListingCatalogMatchDraft[];
  readonly imageReferences: readonly [];
  readonly conditionSummary: null;
  readonly pricing: null;
  readonly shippingProfile: null;
  readonly marketplaceChannel: null;
};
