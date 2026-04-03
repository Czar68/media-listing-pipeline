/**
 * Explicit product identity candidates — no marketplace fields, no condition coupling.
 */

export const IDENTITY_CANDIDATE_SOURCES = ['CATALOG', 'UPC', 'MANUAL'] as const;
export type IdentityCandidateSource = (typeof IDENTITY_CANDIDATE_SOURCES)[number];

export const IDENTITY_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type IdentityConfidenceLevel = (typeof IDENTITY_CONFIDENCE_LEVELS)[number];

export const IDENTITY_MEDIA_TYPES = [
  'BLU_RAY',
  'DVD',
  'CD',
  'UHDBD',
  'GAME_DISC',
  'VINYL',
  'OTHER_PHYSICAL',
] as const;
export type IdentityMediaType = (typeof IDENTITY_MEDIA_TYPES)[number];

export const IDENTITY_REGION_CODES = [
  'NTSC_U',
  'NTSC_J',
  'PAL_UK',
  'PAL_MULTI',
  'REGION_FREE',
  'OTHER',
] as const;
export type IdentityRegionCode = (typeof IDENTITY_REGION_CODES)[number];

export interface IdentityCandidate {
  readonly candidateId: string;
  readonly productId: string;
  readonly source: IdentityCandidateSource;
  readonly confidence: IdentityConfidenceLevel;
  readonly title: string;
  readonly mediaType: IdentityMediaType;
  readonly region: IdentityRegionCode;
  readonly discCount: number;
}
