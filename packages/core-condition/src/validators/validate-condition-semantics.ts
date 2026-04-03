import type { ConditionRecord } from '@media-listing/core-domain';
import type { ValidationFailure, ValidationResult } from '@media-listing/core-domain';
import { validationFail, validationOk } from '@media-listing/core-domain';
import { collectCompletenessGradeContradictions } from '../rules/grade-completeness-rules';
import { collectGradeDefectContradictions } from '../rules/grade-defect-matrix';
import { getCompletenessTemplateRules } from '../standards/completeness-templates';
import { getDefectTaxonomyEntry } from '../standards/defect-taxonomy';

function evidenceKeyForDefect(defectCode: string): string {
  return `DEFECT:${defectCode}`;
}

function collectEvidenceFailures(record: ConditionRecord): readonly ValidationFailure[] {
  const rules = getCompletenessTemplateRules(record.completenessTemplateId);
  if (!rules) {
    return [];
  }

  const bindingByKey = new Map(
    record.evidenceBindings.map((b) => [b.conditionKey, b.refIds] as const),
  );
  const failures: ValidationFailure[] = [];

  const allDefectCodes = new Set<string>();
  for (const c of record.components) {
    for (const d of c.defectEntries) {
      allDefectCodes.add(d.defectCode);
    }
  }

  for (const key of rules.template.requiredEvidenceKeys) {
    const refs = bindingByKey.get(key);
    if (!refs || refs.length === 0) {
      failures.push({
        code: 'MISSING_REQUIRED_EVIDENCE',
        message: `Required evidence key "${key}" is missing or empty.`,
        path: ['evidenceBindings', key],
      });
    }
  }

  for (const code of allDefectCodes) {
    const entry = getDefectTaxonomyEntry(code);
    if (!entry) {
      continue;
    }
    if (entry.requiresEvidence) {
      const k = evidenceKeyForDefect(code);
      const refs = bindingByKey.get(k);
      if (!refs || refs.length === 0) {
        failures.push({
          code: 'MISSING_DEFECT_EVIDENCE',
          message: `Defect ${code} requires evidence under key "${k}".`,
          path: ['evidenceBindings', k],
        });
      }
    }
  }

  return failures;
}

function collectSemanticGradeDefectFailures(
  record: ConditionRecord,
): readonly ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const c of record.components) {
    const label = c.componentId;
    const codes = c.defectEntries.map((d) => d.defectCode);
    failures.push(
      ...collectGradeDefectContradictions(label, c.gradeCode, codes),
    );
  }
  return failures;
}

/**
 * Semantic validation: grade/defect matrix, completeness vs grade, evidence presence.
 */
export function validateConditionSemantics(
  record: ConditionRecord,
): ValidationResult<void> {
  const failures: ValidationFailure[] = [
    ...collectSemanticGradeDefectFailures(record),
    ...collectCompletenessGradeContradictions(
      record.completenessTemplateId,
      record.overallGradeCode,
      record.acknowledgedCompletenessFacets,
    ),
    ...collectEvidenceFailures(record),
  ];

  if (failures.length > 0) {
    return validationFail(failures);
  }
  return validationOk(undefined);
}
