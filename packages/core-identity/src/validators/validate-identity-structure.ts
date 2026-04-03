import type { ValidationFailure, ValidationResult } from '@media-listing/core-domain';
import { validationFail, validationOk } from '@media-listing/core-domain';
import type { IdentityCandidate } from '../model/identity-candidate';
import type { IdentityCandidateSet } from '../model/identity-candidate-set';
import { isDiscCountValid, isNonBlankString } from '../rules/identity-consistency';

function validateCandidateStructure(candidate: IdentityCandidate): readonly ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  if (!isNonBlankString(candidate.candidateId)) {
    failures.push({
      code: 'IDENTITY_CANDIDATE_ID_BLANK',
      message: 'candidateId must be non-empty',
      path: ['candidateId'],
    });
  }
  if (!isNonBlankString(candidate.productId)) {
    failures.push({
      code: 'IDENTITY_PRODUCT_ID_BLANK',
      message: 'productId must be non-empty',
      path: ['productId'],
    });
  }
  if (!isNonBlankString(candidate.title)) {
    failures.push({
      code: 'IDENTITY_TITLE_BLANK',
      message: 'title must be non-empty',
      path: ['title'],
    });
  }
  if (!isDiscCountValid(candidate.discCount)) {
    failures.push({
      code: 'IDENTITY_DISC_COUNT_INVALID',
      message: 'discCount must be a positive integer',
      path: ['discCount'],
    });
  }
  return failures;
}

export function validateIdentityStructureForCandidate(
  candidate: IdentityCandidate,
): ValidationResult<IdentityCandidate> {
  const failures = validateCandidateStructure(candidate);
  if (failures.length > 0) {
    return validationFail(failures);
  }
  return validationOk(candidate);
}

export function validateIdentityStructureForCandidateSet(
  set: IdentityCandidateSet,
): ValidationResult<IdentityCandidateSet> {
  const all: ValidationFailure[] = [];
  set.candidates.forEach((c, i) => {
    const failures = validateCandidateStructure(c);
    for (const f of failures) {
      all.push({
        ...f,
        path: ['candidates', String(i), ...(f.path ?? [])],
      });
    }
  });
  if (all.length > 0) {
    return validationFail(all);
  }
  return validationOk(set);
}
