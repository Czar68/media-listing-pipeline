import type { IdentityResolutionResult } from '@media-listing/core-identity';
import { resolveIdentity } from '@media-listing/core-identity';
import type { IdentityResolutionApplicationResult } from '../model/identity-resolution-application-result';
import type { IdentityResolutionRequest } from '../model/identity-resolution-request';
import { validateIdentityResolutionRequest } from '../validators/validate-identity-resolution-request';

function mapCoreResult(
  core: IdentityResolutionResult,
): IdentityResolutionApplicationResult {
  switch (core.outcome) {
    case 'RESOLVED':
      return {
        outcome: 'RESOLVED',
        resolvedIdentity: core.resolved,
        identitySnapshot: core.snapshot,
      };
    case 'CONFLICT':
      return {
        outcome: 'CONFLICT',
        conflicts: core.conflicts,
      };
    case 'RESEARCH_REQUIRED': {
      const { outcome: _coreOutcome, ...reason } = core;
      return {
        outcome: 'RESEARCH_REQUIRED',
        reason,
      };
    }
  }
}

/**
 * Applies explicit operator input to the locked `resolveIdentity` contract — no selection or alignment inference.
 */
export function applyIdentityResolution(
  request: IdentityResolutionRequest,
): IdentityResolutionApplicationResult {
  validateIdentityResolutionRequest(request);

  const coreResult = resolveIdentity({
    candidateSet: request.candidateSet,
    selectedCandidateId: request.selectedCandidateId ?? undefined,
    operatorId: request.operatorId,
    rationale: request.rationale ?? undefined,
    resolvedAt: request.requestedAt,
    alignment: request.alignmentProbe ?? undefined,
  });

  return mapCoreResult(coreResult);
}
