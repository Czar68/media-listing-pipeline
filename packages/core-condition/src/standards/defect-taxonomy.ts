import type { GradeCode } from '@media-listing/core-domain';
import type { SeverityLevel } from './severity-criteria';

export const DEFECT_TAXONOMY_VERSION = '2026.1.0' as const;

export interface DefectTaxonomyEntry {
  readonly defectCode: string;
  readonly severity: SeverityLevel;
  /** If true, evidence binding for this defect key must be present when defect is listed. */
  readonly requiresEvidence: boolean;
  /**
   * When this defect is asserted, overall/component grade cannot be better than this ceiling
   * (inclusive — at or worse than this grade is allowed).
   */
  readonly maxGradeWhenPresent: GradeCode;
}

export const DEFECT_TAXONOMY: readonly DefectTaxonomyEntry[] = [
  {
    defectCode: 'SCRATCH_LIGHT',
    severity: 'LOW',
    requiresEvidence: false,
    maxGradeWhenPresent: 'LIKE_NEW',
  },
  {
    defectCode: 'SCRATCH_DEEP',
    severity: 'HIGH',
    requiresEvidence: true,
    maxGradeWhenPresent: 'GOOD',
  },
  {
    defectCode: 'CRACK_HUB',
    severity: 'CRITICAL',
    requiresEvidence: true,
    maxGradeWhenPresent: 'POOR',
  },
  {
    defectCode: 'CASE_BROKEN',
    severity: 'MEDIUM',
    requiresEvidence: true,
    maxGradeWhenPresent: 'FAIR',
  },
  {
    defectCode: 'INSERT_MISSING',
    severity: 'MEDIUM',
    requiresEvidence: false,
    maxGradeWhenPresent: 'VERY_GOOD',
  },
] as const;

const byCode = new Map<string, DefectTaxonomyEntry>(
  DEFECT_TAXONOMY.map((e) => [e.defectCode, e]),
);

export function getDefectTaxonomyEntry(code: string): DefectTaxonomyEntry | undefined {
  return byCode.get(code);
}
