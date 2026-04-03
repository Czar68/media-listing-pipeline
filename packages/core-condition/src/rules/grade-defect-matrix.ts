import type { GradeCode } from '@media-listing/core-domain';
import type { ValidationFailure } from '@media-listing/core-domain';
import { getDefectTaxonomyEntry } from '../standards/defect-taxonomy';
import { gradeIsBetterThan } from '../standards/grading-standards';

/**
 * Semantic rule: asserted grade cannot be better than allowed for listed defects.
 */
export function collectGradeDefectContradictions(
  componentLabel: string,
  grade: GradeCode,
  defectCodes: readonly string[],
): readonly ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const code of defectCodes) {
    const entry = getDefectTaxonomyEntry(code);
    if (!entry) {
      failures.push({
        code: 'UNKNOWN_DEFECT_CODE',
        message: `Unknown defect code "${code}" for ${componentLabel}.`,
        path: [componentLabel, 'defectEntries'],
      });
      continue;
    }
    if (gradeIsBetterThan(grade, entry.maxGradeWhenPresent)) {
      failures.push({
        code: 'GRADE_DEFECT_SEMANTIC_CONTRADICTION',
        message: `Grade ${grade} is incompatible with defect ${code} (max when present: ${entry.maxGradeWhenPresent}).`,
        path: [componentLabel, 'gradeCode'],
      });
    }
  }
  return failures;
}
