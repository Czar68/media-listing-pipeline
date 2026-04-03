import type { IdentityRegionCode } from '@media-listing/core-identity';
import type { ScanSource } from './scan-record';

/**
 * Trimmed and format-checked scan — does not invent missing observations.
 */
export interface NormalizedScan {
  readonly scanId: string;
  readonly scanSource: ScanSource;
  readonly normalizedTitle: string | null;
  readonly normalizedUPC: string | null;
  readonly observedDiscCount: number | null;
  readonly observedRegion: IdentityRegionCode | null;
  readonly discFingerprints: readonly string[] | undefined;
  readonly timestamp: string;
}
