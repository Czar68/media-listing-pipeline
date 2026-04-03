export const RESOLUTION_AUDIT_OUTCOME_TYPES = ['RESOLVED', 'CONFLICT', 'RESEARCH_REQUIRED'] as const;
export type ResolutionAuditOutcomeType = (typeof RESOLUTION_AUDIT_OUTCOME_TYPES)[number];

/**
 * Serializable audit row — no persistence; data only.
 */
export interface ResolutionAuditRecord {
  readonly requestId: string;
  readonly operatorId: string;
  readonly selectedCandidateId: string | null;
  readonly requestedAt: string;
  readonly outcomeType: ResolutionAuditOutcomeType;
  readonly snapshotId: string | null;
  readonly rationale: string | null;
}
