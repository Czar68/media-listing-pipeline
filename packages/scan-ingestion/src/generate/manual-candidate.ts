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

function manualTitle(normalized: NormalizedScan): string | null {
  if (normalized.normalizedTitle !== null) {
    return normalized.normalizedTitle;
  }
  if (normalized.normalizedUPC !== null) {
    return `UPC ${normalized.normalizedUPC}`;
  }
  return null;
}

export interface ManualMatchOutput {
  readonly candidates: readonly IdentityCandidate[];
  readonly warnings: readonly string[];
}

export function matchManualCandidates(
  normalized: NormalizedScan,
  startIndex: number,
  deterministicId: DeterministicIdFn,
): ManualMatchOutput {
  if (normalized.scanSource !== 'MANUAL') {
    return { candidates: [], warnings: [] };
  }

  const title = manualTitle(normalized);
  if (title === null) {
    return { candidates: [], warnings: [] };
  }

  const productKey = hashKey(`${normalized.scanId}|${title}`);
  const c: IdentityCandidate = {
    candidateId: deterministicId('MANUAL', title, startIndex),
    productId: `manual:${productKey}`,
    source: 'MANUAL',
    confidence: 'LOW',
    title,
    mediaType: DEFAULT_MEDIA,
    region: candidateRegion(normalized),
    discCount: candidateDiscCount(normalized),
  };

  return { candidates: [c], warnings: [] };
}
