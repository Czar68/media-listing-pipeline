import type { CatalogMatchInput } from '@media-listing/catalog-match-input';

import type { CatalogMatchedCandidate, CatalogMatcherResult } from './types';

function normalizedProductIdKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function matchCatalogByUpc(input: CatalogMatchInput): CatalogMatcherResult {
  const { identity, candidates } = input;

  if (identity === null || identity.source !== 'UPC') {
    return { matchKind: 'NONE', matches: [] };
  }

  const needle = normalizedProductIdKey(identity.productId);
  if (needle.length === 0) {
    return { matchKind: 'NONE', matches: [] };
  }

  const matches: CatalogMatchedCandidate[] = [];
  for (const c of candidates) {
    if (c.productId === null) {
      continue;
    }
    if (c.productId === needle) {
      matches.push(c);
    }
  }

  if (matches.length === 0) {
    return { matchKind: 'NONE', matches: [] };
  }

  return { matchKind: 'UPC_EXACT', matches };
}
