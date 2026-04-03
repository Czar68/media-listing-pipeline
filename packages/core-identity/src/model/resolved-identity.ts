export const IDENTITY_DECISION_SOURCES = ['MANUAL'] as const;
export type IdentityDecisionSource = (typeof IDENTITY_DECISION_SOURCES)[number];

export interface ResolvedIdentity {
  readonly selectedCandidateId: string;
  readonly decisionSource: IdentityDecisionSource;
  readonly timestamp: string;
  readonly operatorId: string;
  readonly rationale?: string;
}
