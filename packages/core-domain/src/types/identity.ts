/**
 * Identity and scan artifacts — no marketplace fields.
 */

export interface ScanRecord {
  readonly scanId: string;
  readonly capturedAtIso: string;
  readonly scannerLabel: string;
}

export interface IdentityCandidate {
  readonly candidateId: string;
  readonly fingerprint: string;
  readonly rank: number;
}

export interface IdentitySnapshot {
  readonly snapshotId: string;
  readonly stableTitleKey: string;
  readonly regionCode: string;
  readonly expectedDiscSlotCount: number;
  readonly catalogDiscFingerprintsOrdered: readonly string[];
}

export interface ResolvedIdentity {
  readonly resolutionId: string;
  readonly chosenCandidateId: string;
  readonly snapshot: IdentitySnapshot;
}

/**
 * Per-slot pairing used to detect catalog vs observed mismatches (no inference).
 */
export interface DiscSlotAlignment {
  readonly slotIndex: number;
  readonly catalogFingerprint: string;
  readonly observedFingerprint: string;
}

export const IDENTITY_CONFLICT_REASONS = [
  'MISMATCHED_DISC',
  'REGION_CONFLICT',
] as const;

export type IdentityConflictReason = (typeof IDENTITY_CONFLICT_REASONS)[number];

export interface IdentityAlignmentInput {
  readonly slots: readonly DiscSlotAlignment[];
  readonly catalogRegionCode: string;
  readonly observedRegionCode: string;
}
