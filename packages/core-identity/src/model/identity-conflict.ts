import type { IdentityRegionCode } from './identity-candidate';

export const IDENTITY_CONFLICT_KINDS = [
  'MISMATCHED_DISC',
  'REGION_CONFLICT',
  'MULTI_MATCH_AMBIGUITY',
  'INSUFFICIENT_DATA',
] as const;
export type IdentityConflictKind = (typeof IDENTITY_CONFLICT_KINDS)[number];

export const INSUFFICIENT_DATA_REASONS = [
  'SELECTION_REQUIRED',
  'UNKNOWN_SELECTED_ID',
  'INVALID_STRUCTURE',
] as const;
export type InsufficientDataReason = (typeof INSUFFICIENT_DATA_REASONS)[number];

export type IdentityConflict =
  | {
      readonly kind: 'MISMATCHED_DISC';
      readonly expectedDiscCount: number;
      readonly observedDiscCount: number;
      readonly slotIndex?: number;
      readonly catalogFingerprint?: string;
      readonly observedFingerprint?: string;
    }
  | {
      readonly kind: 'REGION_CONFLICT';
      readonly catalogRegion: IdentityRegionCode;
      readonly observedRegion: IdentityRegionCode;
    }
  | {
      readonly kind: 'MULTI_MATCH_AMBIGUITY';
      readonly orderedCandidateIds: readonly string[];
    }
  | {
      readonly kind: 'INSUFFICIENT_DATA';
      readonly reason: InsufficientDataReason;
    };
