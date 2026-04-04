import type { PreparedListingDraft } from '@media-listing/listing-preparation';
import type { PublishableListingPayload } from './types';

export function buildListingPayload(
  draft: PreparedListingDraft,
): PublishableListingPayload {
  return {
    catalogMatches: draft.catalogMatches,
    imageReferences: draft.imageReferences,
    conditionSummary: draft.conditionSummary,
    pricing: draft.pricing,
    shippingProfile: draft.shippingProfile,
    marketplaceChannel: draft.marketplaceChannel,
  };
}
