import type { CatalogMatchCandidate } from '@media-listing/catalog-match-input';

export type CatalogMatchOrchestratorResult =
  | { readonly matchKind: 'UPC_EXACT'; readonly matches: readonly CatalogMatchCandidate[] }
  | { readonly matchKind: 'TITLE_EXACT'; readonly matches: readonly CatalogMatchCandidate[] }
  | { readonly matchKind: 'NONE'; readonly matches: readonly CatalogMatchCandidate[] };
