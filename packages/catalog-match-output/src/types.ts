import type { CatalogMatchSelectionResult } from '@media-listing/catalog-match-selection';

export type CatalogMatchOutputInput = CatalogMatchSelectionResult;

export type CatalogMatchOutputResult = {
  readonly matches: CatalogMatchSelectionResult['matches'];
};
