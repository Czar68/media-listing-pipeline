import type { GradeCode } from '@media-listing/core-domain';
import type { ValidationFailure } from '@media-listing/core-domain';
import { getCompletenessTemplateRules } from '../standards/completeness-templates';
import { gradeIsBetterOrEqual } from '../standards/grading-standards';

/**
 * If overall grade meets a tier, all declared completeness facets for that tier must be acknowledged.
 */
export function collectCompletenessGradeContradictions(
  templateId: string,
  overallGrade: GradeCode,
  acknowledgedFacets: readonly string[],
): readonly ValidationFailure[] {
  const rules = getCompletenessTemplateRules(templateId);
  if (!rules) {
    return [
      {
        code: 'UNKNOWN_COMPLETENESS_TEMPLATE',
        message: `Completeness template "${templateId}" is not registered.`,
        path: ['completenessTemplateId'],
      },
    ];
  }

  const ack = new Set(acknowledgedFacets);
  const failures: ValidationFailure[] = [];

  for (const rule of rules.gradeFacetRules) {
    if (gradeIsBetterOrEqual(overallGrade, rule.minimumOverallGrade)) {
      for (const facet of rule.requiredFacetKeys) {
        if (!ack.has(facet)) {
          failures.push({
            code: 'COMPLETENESS_GRADE_CONTRADICTION',
            message: `Overall grade ${overallGrade} requires acknowledged facet "${facet}" (tier ${rule.minimumOverallGrade}).`,
            path: ['acknowledgedCompletenessFacets'],
          });
        }
      }
    }
  }

  return failures;
}
