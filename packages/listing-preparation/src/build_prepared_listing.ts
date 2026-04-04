import type { ListingInputOutput, PreparedListingDraft } from './types';

export function buildPreparedListing(
  input: ListingInputOutput,
): PreparedListingDraft {
  return {
    catalogMatches: input.matches,
    imageReferences: [],
    conditionSummary: null,
    pricing: null,
    shippingProfile: null,
    marketplaceChannel: null,
  };
}
