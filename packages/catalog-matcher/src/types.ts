import type { CatalogMatchCandidate } from '@media-listing/catalog-match-input';

export type CatalogMatchedCandidate = CatalogMatchCandidate;

export type CatalogMatcherResult =
  | { readonly matchKind: 'UPC_EXACT'; readonly matches: readonly CatalogMatchedCandidate[] }
  | { readonly matchKind: 'NONE'; readonly matches: readonly CatalogMatchedCandidate[] };
