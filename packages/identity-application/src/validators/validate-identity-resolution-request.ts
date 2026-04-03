import type { ValidationFailure, ValidationResult } from '@media-listing/core-domain';
import { validationFail, validationOk } from '@media-listing/core-domain';
import type { IdentityResolutionRequest } from '../model/identity-resolution-request';

function isIso8601Like(s: string): boolean {
  return !Number.isNaN(Date.parse(s));
}

export function validateIdentityResolutionRequest(
  request: IdentityResolutionRequest,
): ValidationResult<IdentityResolutionRequest> {
  const failures: ValidationFailure[] = [];

  if (request.requestId.trim().length === 0) {
    failures.push({
      code: 'REQUEST_ID_BLANK',
      message: 'requestId must be non-empty',
      path: ['requestId'],
    });
  }

  if (request.operatorId.trim().length === 0) {
    failures.push({
      code: 'OPERATOR_ID_BLANK',
      message: 'operatorId must be non-empty',
      path: ['operatorId'],
    });
  }

  if (request.requestedAt.trim().length === 0) {
    failures.push({
      code: 'REQUESTED_AT_BLANK',
      message: 'requestedAt must be non-empty',
      path: ['requestedAt'],
    });
  } else if (!isIso8601Like(request.requestedAt)) {
    failures.push({
      code: 'REQUESTED_AT_UNPARSEABLE',
      message: 'requestedAt must be a parseable ISO 8601 string',
      path: ['requestedAt'],
    });
  }

  if (failures.length > 0) {
    return validationFail(failures);
  }
  return validationOk(request);
}
