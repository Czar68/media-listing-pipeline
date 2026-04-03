import type { IdentityRegionCode } from '@media-listing/core-identity';

export const SCAN_SOURCES = ['DISC', 'UPC', 'MANUAL'] as const;
export type ScanSource = (typeof SCAN_SOURCES)[number];

/**
 * Raw scan input — no defaults; optional fields are explicit null or omitted.
 */
export interface ScanRecord {
  readonly scanId: string;
  readonly scanSource: ScanSource;
  readonly rawTitle: string | null;
  readonly rawUPC: string | null;
  readonly observedDiscCount: number | null;
  readonly observedRegion: IdentityRegionCode | null;
  readonly discFingerprints?: readonly string[];
  readonly timestamp: string;
}
