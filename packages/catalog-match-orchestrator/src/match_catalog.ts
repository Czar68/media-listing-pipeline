import type { CatalogMatchInput } from '@media-listing/catalog-match-input';
import { matchCatalogByUpc } from '@media-listing/catalog-matcher';
import { matchCatalogByTitle } from '@media-listing/catalog-title-matcher';

import type { CatalogMatchOrchestratorResult } from './types';

export function matchCatalog(input: CatalogMatchInput): CatalogMatchOrchestratorResult {
  const { identity } = input;

  if (identity === null) {
    return { matchKind: 'NONE', matches: [] };
  }

  switch (identity.source) {
    case 'UPC':
      return matchCatalogByUpc(input);
    case 'CATALOG':
    case 'MANUAL':
      return matchCatalogByTitle(input);
    default:
      return { matchKind: 'NONE', matches: [] };
  }
}
