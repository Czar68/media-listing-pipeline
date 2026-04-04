import type { ListingOutputInput, ListingOutputResult } from './types';

export function buildListingOutput(
  input: ListingOutputInput,
): ListingOutputResult {
  return {
    publishableListing: input,
    marketplaceAssignedIdentifiers: null,
    publicationDeliveryMetadata: null,
  };
}
