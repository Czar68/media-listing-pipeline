import type { IdentityResolutionResult } from '@media-listing/core-identity';
import { resolveIdentity } from '@media-listing/core-identity';
import type { IdentityResolutionApplicationResult } from '../model/identity-resolution-application-result';
import type { IdentityResolutionRequest } from '../model/identity-resolution-request';
import { validateIdentityResolutionRequest } from '../validators/validate-identity-resolution-request';

function mapCoreResult(
  core: IdentityResolutionResult,
): IdentityResolutionApplicationResult {
  if (core.outcome === 'RESOLVED') {
    return {
      kind: 'RESOLVED',
      resolvedIdentity: core.resolved,
      identitySnapshot: core.snapshot,
    };
  }
  if (core.outcome === 'CONFLICT') {
    return {
      kind: 'CONFLICT',
      conflicts: core.conflicts,
    };
  }
  return {
    kind: 'RESEARCH_REQUIRED',
    researchRequiredPayload: core,
  };
}

/**
 * Applies explicit operator input to the locked `resolveIdentity` contract — no selection or alignment inference.
 */
export function applyIdentityResolution(
  request: IdentityResolutionRequest,
): IdentityResolutionApplicationResult {
  const validated = validateIdentityResolutionRequest(request);
  if (!validated.ok) {
    return {
      kind: 'CONFLICT',
      conflicts: [{ kind: 'INSUFFICIENT_DATA', reason: 'INVALID_STRUCTURE' }],
    };
  }

  const r = validated.value;
  const coreResult = resolveIdentity({
    candidateSet: r.candidateSet,
    selectedCandidateId: r.selectedCandidateId ?? undefined,
    operatorId: r.operatorId,
    rationale: r.rationale ?? undefined,
    resolvedAt: r.requestedAt,
    alignment: r.alignmentProbe ?? undefined,
  });

  return mapCoreResult(coreResult);
}
