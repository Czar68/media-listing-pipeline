import type { IdentityResolutionRequest } from '../model/identity-resolution-request';

function assertRequestId(requestId: string): void {
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    throw new Error('INVALID_IDENTITY_RESOLUTION_REQUEST: requestId must exist');
  }
}

function assertOperatorId(operatorId: string): void {
  if (typeof operatorId !== 'string' || operatorId.trim().length === 0) {
    throw new Error('INVALID_IDENTITY_RESOLUTION_REQUEST: operatorId must exist');
  }
}

function assertCandidateSet(
  candidateSet: IdentityResolutionRequest['candidateSet'],
): asserts candidateSet is IdentityResolutionRequest['candidateSet'] {
  if (candidateSet === undefined || candidateSet === null) {
    throw new Error('INVALID_IDENTITY_RESOLUTION_REQUEST: candidateSet must exist');
  }
  if (typeof candidateSet !== 'object' || !Array.isArray(candidateSet.candidates)) {
    throw new Error('INVALID_IDENTITY_RESOLUTION_REQUEST: candidateSet must exist');
  }
}

function assertSelectedCandidateMembership(request: IdentityResolutionRequest): void {
  const { selectedCandidateId, candidateSet } = request;
  if (selectedCandidateId === null) {
    return;
  }
  const ok = candidateSet.candidates.some((c) => c.candidateId === selectedCandidateId);
  if (!ok) {
    throw new Error('INVALID_IDENTITY_RESOLUTION_REQUEST: selectedCandidateId must exist in candidateSet');
  }
}

/**
 * Validates operator input without mutating it. Throws on invalid input.
 */
export function validateIdentityResolutionRequest(request: IdentityResolutionRequest): void {
  assertRequestId(request.requestId);
  assertOperatorId(request.operatorId);
  assertCandidateSet(request.candidateSet);
  assertSelectedCandidateMembership(request);
}
