import type { CatalogMatchCandidate } from '@media-listing/catalog-match-input';

export type CatalogTitleMatchedCandidate = CatalogMatchCandidate;

export type CatalogTitleMatcherResult =
  | { readonly matchKind: 'TITLE_EXACT'; readonly matches: readonly CatalogTitleMatchedCandidate[] }
  | { readonly matchKind: 'NONE'; readonly matches: readonly CatalogTitleMatchedCandidate[] };
