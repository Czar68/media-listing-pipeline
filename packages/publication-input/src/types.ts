import type { ListingOutputResult } from '@media-listing/listing-output';

export type PublicationInputInput = ListingOutputResult;

/**
 * Publication request input for downstream adapters and executors.
 * Preserves the listing-output hand-off; request-only fields that cannot be
 * derived from listing-output are explicit null placeholders.
 */
export type PublicationRequestInput = {
  readonly listingOutputHandoff: ListingOutputResult;
  /** Not produced by listing-output; adapter/runtime binding (filled by publication layer). */
  readonly adapterExecutionContext: null;
  /** Not produced by listing-output; idempotency or correlation for the publication request. */
  readonly publicationRequestCorrelation: null;
};
