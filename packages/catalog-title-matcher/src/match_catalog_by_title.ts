import type { CatalogMatchInput } from '@media-listing/catalog-match-input';

import type { CatalogTitleMatchedCandidate, CatalogTitleMatcherResult } from './types';

function normalizeIdentityTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function matchCatalogByTitle(input: CatalogMatchInput): CatalogTitleMatcherResult {
  const { identity, candidates } = input;

  if (identity === null || identity.source === 'UPC') {
    return { matchKind: 'NONE', matches: [] };
  }

  if (identity.source !== 'CATALOG' && identity.source !== 'MANUAL') {
    return { matchKind: 'NONE', matches: [] };
  }

  const needle = normalizeIdentityTitle(identity.title);
  if (needle.length === 0) {
    return { matchKind: 'NONE', matches: [] };
  }

  const matches: CatalogTitleMatchedCandidate[] = [];
  for (const c of candidates) {
    if (c.title === null) {
      continue;
    }
    if (c.title === needle) {
      matches.push(c);
    }
  }

  if (matches.length === 0) {
    return { matchKind: 'NONE', matches: [] };
  }

  return { matchKind: 'TITLE_EXACT', matches };
}
