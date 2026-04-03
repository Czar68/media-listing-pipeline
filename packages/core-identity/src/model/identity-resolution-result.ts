import type { IdentityConflict } from './identity-conflict';
import type { IdentitySnapshot } from './identity-snapshot';
import type { ResolvedIdentity } from './resolved-identity';

export type IdentityResolutionResult =
  | {
      readonly outcome: 'RESOLVED';
      readonly resolved: ResolvedIdentity;
      readonly snapshot: IdentitySnapshot;
    }
  | {
      readonly outcome: 'CONFLICT';
      readonly conflicts: readonly IdentityConflict[];
    }
  | {
      readonly outcome: 'RESEARCH_REQUIRED';
    };
