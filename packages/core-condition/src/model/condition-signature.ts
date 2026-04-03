import type { ConditionSignatureEvent } from '@media-listing/core-domain';
import { GRADING_STANDARDS_VERSION } from '../standards/grading-standards';
import { SEVERITY_CRITERIA_VERSION } from '../standards/severity-criteria';

export function buildConditionSignatureEvent(params: {
  readonly signatureId: string;
  readonly recordId: string;
  readonly completenessHash: string;
  readonly createdAtIso: string;
}): ConditionSignatureEvent {
  return {
    signatureId: params.signatureId,
    recordId: params.recordId,
    completenessHash: params.completenessHash,
    gradingStandardsVersion: GRADING_STANDARDS_VERSION,
    severityCriteriaVersion: SEVERITY_CRITERIA_VERSION,
    createdAtIso: params.createdAtIso,
  };
}
