import type { IdentityResolutionApplicationResult } from '../model/identity-resolution-application-result';
import type { IdentityResolutionRequest } from '../model/identity-resolution-request';
import type { ResolutionAuditRecord } from '../model/resolution-audit-record';

export function buildResolutionAuditRecord(
  request: IdentityResolutionRequest,
  result: IdentityResolutionApplicationResult,
): ResolutionAuditRecord {
  const snapshotId = result.outcome === 'RESOLVED' ? result.identitySnapshot.snapshotId : null;

  return {
    requestId: request.requestId,
    operatorId: request.operatorId,
    selectedCandidateId: request.selectedCandidateId,
    requestedAt: request.requestedAt,
    outcomeType: result.outcome,
    snapshotId,
    rationale: request.rationale,
  };
}
