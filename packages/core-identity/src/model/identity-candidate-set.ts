import type { IdentityCandidate } from './identity-candidate';

/**
 * Ordered candidate list — order is preserved; callers must not auto-select.
 */
export interface IdentityCandidateSet {
  readonly candidates: readonly IdentityCandidate[];
}

export function createIdentityCandidateSet(
  candidates: readonly IdentityCandidate[],
): IdentityCandidateSet {
  return { candidates: [...candidates] };
}
