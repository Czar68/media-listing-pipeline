import { createHash } from 'crypto';
import type { IdentityCandidate, IdentityRegionCode } from '@media-listing/core-identity';
import type { NormalizedScan } from '../model/normalized-scan';
import type { DeterministicIdFn } from './upc-matcher';

const DEFAULT_MEDIA = 'OTHER_PHYSICAL' as const;

function hashKey(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function candidateDiscCount(normalized: NormalizedScan): number {
  if (normalized.observedDiscCount !== null && normalized.observedDiscCount >= 1) {
    return normalized.observedDiscCount;
  }
  return 1;
}

function candidateRegion(normalized: NormalizedScan): IdentityRegionCode {
  if (normalized.observedRegion !== null) {
    return normalized.observedRegion;
  }
  return 'OTHER';
}

/**
 * Deterministic structured parse: first segment before " || " (double pipe), else full title.
 * Exact match on the chosen segment only — no fuzzy matching.
 */
export function catalogTitleFromStructured(normalizedTitle: string): string {
  const sep = ' || ';
  const idx = normalizedTitle.indexOf(sep);
  if (idx === -1) {
    return normalizedTitle.trim();
  }
  return normalizedTitle.slice(0, idx).trim();
}

export interface TitleMatchOutput {
  readonly candidates: readonly IdentityCandidate[];
  readonly warnings: readonly string[];
}

export function matchTitleCandidates(
  normalized: NormalizedScan,
  startIndex: number,
  deterministicId: DeterministicIdFn,
): TitleMatchOutput {
  if (normalized.normalizedTitle === null) {
    return { candidates: [], warnings: [] };
  }

  const catalogTitle = catalogTitleFromStructured(normalized.normalizedTitle);
  if (catalogTitle.length === 0) {
    return { candidates: [], warnings: [] };
  }

  const productKey = hashKey(catalogTitle);
  const c: IdentityCandidate = {
    candidateId: deterministicId('CATALOG', catalogTitle, startIndex),
    productId: `catalog:${productKey}`,
    source: 'CATALOG',
    confidence: 'MEDIUM',
    title: catalogTitle,
    mediaType: DEFAULT_MEDIA,
    region: candidateRegion(normalized),
    discCount: candidateDiscCount(normalized),
  };

  return { candidates: [c], warnings: [] };
}
