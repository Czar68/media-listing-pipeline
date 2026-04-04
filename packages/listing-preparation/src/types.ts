import type {
  ListingPreparationCatalogRecord,
  ListingPreparationInput,
} from '@media-listing/listing-input';

/**
 * Seam output from the listing-input phase — sole upstream input for prepared listing.
 */
export type ListingInputOutput = ListingPreparationInput;

/**
 * Catalog rows carried into the draft; same fields as listing-input, no synthesis.
 */
export type PreparedListingCatalogMatchDraft = ListingPreparationCatalogRecord;

/**
 * Deterministic prepared-listing draft: only catalog matches are populated from upstream;
 * other dimensions are explicit null or empty array where structurally reserved.
 */
export type PreparedListingDraft = {
  readonly catalogMatches: readonly PreparedListingCatalogMatchDraft[];
  readonly imageReferences: readonly [];
  readonly conditionSummary: null;
  readonly pricing: null;
  readonly shippingProfile: null;
  readonly marketplaceChannel: null;
};
