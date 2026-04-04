import type {
  IdentityConflict,
  IdentityResolutionResult,
  IdentitySnapshot,
  ResolvedIdentity,
} from '@media-listing/core-identity';

type ResearchRequiredPassthrough = Omit<
  Extract<IdentityResolutionResult, { outcome: 'RESEARCH_REQUIRED' }>,
  'outcome'
>;

export type IdentityResolutionApplicationResult =
  | {
      readonly outcome: 'RESOLVED';
      readonly resolvedIdentity: ResolvedIdentity;
      readonly identitySnapshot: IdentitySnapshot;
    }
  | {
      readonly outcome: 'CONFLICT';
      readonly conflicts: readonly IdentityConflict[];
    }
  | {
      readonly outcome: 'RESEARCH_REQUIRED';
      readonly reason: ResearchRequiredPassthrough;
    };
