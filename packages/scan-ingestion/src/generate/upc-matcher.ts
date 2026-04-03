import type { IdentityCandidate, IdentityRegionCode } from '@media-listing/core-identity';
import type { NormalizedScan } from '../model/normalized-scan';

const DEFAULT_MEDIA = 'OTHER_PHYSICAL' as const;

export type DeterministicIdFn = (
  branch: 'UPC' | 'CATALOG' | 'MANUAL',
  key: string,
  index: number,
) => string;

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

function titleForUpcCandidate(normalized: NormalizedScan): string {
  if (normalized.normalizedTitle !== null) {
    return normalized.normalizedTitle;
  }
  return `UPC ${normalized.normalizedUPC as string}`;
}

export interface UpcMatchOutput {
  readonly candidates: readonly IdentityCandidate[];
  readonly warnings: readonly string[];
}

export function matchUpcCandidates(
  normalized: NormalizedScan,
  startIndex: number,
  deterministicId: DeterministicIdFn,
): UpcMatchOutput {
  if (normalized.normalizedUPC === null) {
    return { candidates: [], warnings: [] };
  }

  const upc = normalized.normalizedUPC;
  const c: IdentityCandidate = {
    candidateId: deterministicId('UPC', upc, startIndex),
    productId: `upc:${upc}`,
    source: 'UPC',
    confidence: 'HIGH',
    title: titleForUpcCandidate(normalized),
    mediaType: DEFAULT_MEDIA,
    region: candidateRegion(normalized),
    discCount: candidateDiscCount(normalized),
  };

  return { candidates: [c], warnings: [] };
}
