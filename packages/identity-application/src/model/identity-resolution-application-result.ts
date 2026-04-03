import type {
  IdentityConflict,
  IdentityResolutionResult,
  IdentitySnapshot,
  ResolvedIdentity,
} from '@media-listing/core-identity';

export type IdentityResolutionApplicationResult =
  | {
      readonly kind: 'RESOLVED';
      readonly resolvedIdentity: ResolvedIdentity;
      readonly identitySnapshot: IdentitySnapshot;
    }
  | {
      readonly kind: 'CONFLICT';
      readonly conflicts: readonly IdentityConflict[];
    }
  | {
      readonly kind: 'RESEARCH_REQUIRED';
      readonly researchRequiredPayload: Extract<IdentityResolutionResult, { outcome: 'RESEARCH_REQUIRED' }>;
    };
