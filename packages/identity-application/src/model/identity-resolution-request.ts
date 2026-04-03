import type { IdentityAlignmentProbe, IdentityCandidateSet } from '@media-listing/core-identity';

/**
 * Explicit operator intent — no inferred selection or fabricated alignment.
 */
export interface IdentityResolutionRequest {
  readonly requestId: string;
  readonly candidateSet: IdentityCandidateSet;
  readonly selectedCandidateId: string | null;
  readonly operatorId: string;
  readonly rationale: string | null;
  readonly requestedAt: string;
  readonly alignmentProbe: IdentityAlignmentProbe | null;
}
