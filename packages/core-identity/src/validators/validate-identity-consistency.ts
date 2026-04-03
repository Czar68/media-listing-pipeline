import type { ValidationFailure, ValidationResult } from '@media-listing/core-domain';
import { validationFail, validationOk } from '@media-listing/core-domain';
import type { IdentityCandidateSet } from '../model/identity-candidate-set';
import type { IdentityAlignmentProbe } from '../rules/identity-conflict-detection';

/**
 * Cross-checks that a candidate set can be checked against a probe (counts/regions are enum-backed).
 */
export function validateIdentityConsistencyForResolution(
  set: IdentityCandidateSet,
  probe: IdentityAlignmentProbe,
): ValidationResult<{ readonly set: IdentityCandidateSet; readonly probe: IdentityAlignmentProbe }> {
  const failures: ValidationFailure[] = [];
  if (!Number.isInteger(probe.observedDiscSlotCount) || probe.observedDiscSlotCount < 0) {
    failures.push({
      code: 'IDENTITY_PROBE_DISC_COUNT_INVALID',
      message: 'observedDiscSlotCount must be a non-negative integer',
      path: ['observedDiscSlotCount'],
    });
  }
  if (failures.length > 0) {
    return validationFail(failures);
  }
  return validationOk({ set, probe });
}
