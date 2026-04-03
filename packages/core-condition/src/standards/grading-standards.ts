import type { GradeCode } from '@media-listing/core-domain';

/** Versioned in code — bump when grade ordering or caps change. */
export const GRADING_STANDARDS_VERSION = '2026.1.0' as const;

/** Worst → best (index 0 = worst quality). */
export const ORDERED_GRADES_WORST_TO_BEST: readonly GradeCode[] = [
  'POOR',
  'FAIR',
  'GOOD',
  'VERY_GOOD',
  'EXCELLENT',
  'LIKE_NEW',
  'MINT',
] as const;

export function gradeRank(grade: GradeCode): number {
  const i = ORDERED_GRADES_WORST_TO_BEST.indexOf(grade);
  if (i < 0) {
    throw new Error(`Unknown grade code: ${grade}`);
  }
  return i;
}

/** True if `a` is strictly better quality than `b`. */
export function gradeIsBetterThan(a: GradeCode, b: GradeCode): boolean {
  return gradeRank(a) > gradeRank(b);
}

/** True if `a` is better or equal to `b`. */
export function gradeIsBetterOrEqual(a: GradeCode, b: GradeCode): boolean {
  return gradeRank(a) >= gradeRank(b);
}

/**
 * Resurfaced media cannot exceed this ceiling (inclusive).
 * POOR … VERY_GOOD allowed; EXCELLENT+ blocked.
 */
export const RESURFACED_MAX_GRADE: GradeCode = 'VERY_GOOD';

export function resurfacedGradeWithinCeiling(grade: GradeCode): boolean {
  return gradeRank(grade) <= gradeRank(RESURFACED_MAX_GRADE);
}
