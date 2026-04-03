import type {
  ConditionComponent,
  ConditionRecord,
  DiscConditionComponent,
  GradeCode,
} from '@media-listing/core-domain';
import type { ValidationFailure } from '@media-listing/core-domain';
import {
  gradeRank,
  resurfacedGradeWithinCeiling,
} from '../standards/grading-standards';

function isDisc(c: ConditionComponent): c is DiscConditionComponent {
  return c.kind === 'DISC';
}

/**
 * Overall grade cannot be better than the worst component grade.
 */
export function collectOverallVersusComponentsFailures(
  record: ConditionRecord,
): readonly ValidationFailure[] {
  const grades: GradeCode[] = record.components.map((c) => c.gradeCode);
  if (grades.length === 0) {
    return [
      {
        code: 'NO_COMPONENTS',
        message: 'Condition record has no components.',
        path: ['components'],
      },
    ];
  }
  const minRank = Math.min(...grades.map(gradeRank));
  const overallRank = gradeRank(record.overallGradeCode);
  if (overallRank > minRank) {
    return [
      {
        code: 'OVERALL_EXCEEDS_WORST_COMPONENT',
        message: `Overall grade ${record.overallGradeCode} is better than the worst component grade.`,
        path: ['overallGradeCode'],
      },
    ];
  }
  return [];
}

export function collectResurfacedCeilingFailures(
  record: ConditionRecord,
): readonly ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const c of record.components) {
    if (!isDisc(c)) {
      continue;
    }
    if (c.resurfaced && !resurfacedGradeWithinCeiling(c.gradeCode)) {
      failures.push({
        code: 'RESURFACED_GRADE_CEILING',
        message: `Resurfaced disc ${c.componentId} cannot exceed VERY_GOOD (got ${c.gradeCode}).`,
        path: [c.componentId, 'gradeCode'],
      });
    }
  }
  return failures;
}
