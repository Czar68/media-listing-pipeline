import type { IdentityCandidateSet } from '@media-listing/core-identity';

export interface CandidateGenerationSuccess {
  readonly kind: 'SUCCESS';
  readonly candidateSet: IdentityCandidateSet;
}

export interface CandidateGenerationPartial {
  readonly kind: 'PARTIAL';
  readonly candidateSet: IdentityCandidateSet;
  readonly warnings: readonly string[];
}

export interface CandidateGenerationFailure {
  readonly kind: 'FAILURE';
  readonly reasons: readonly string[];
}

export type CandidateGenerationResult =
  | CandidateGenerationSuccess
  | CandidateGenerationPartial
  | CandidateGenerationFailure;
