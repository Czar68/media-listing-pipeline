/**
 * Physical condition representation — human-asserted, no defaults in validators.
 */

export const MEDIA_KINDS = ['SINGLE_DISC', 'MULTI_DISC_SET'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const CONDITION_COMPONENT_KINDS = ['DISC', 'CASE'] as const;
export type ConditionComponentKind = (typeof CONDITION_COMPONENT_KINDS)[number];

/** Canonical grade literals for v1 (ordering lives in core-condition standards). */
export const GRADE_CODES = [
  'POOR',
  'FAIR',
  'GOOD',
  'VERY_GOOD',
  'EXCELLENT',
  'LIKE_NEW',
  'MINT',
] as const;

export type GradeCode = (typeof GRADE_CODES)[number];

export interface ConditionDefectEntry {
  readonly defectCode: string;
}

export interface DiscConditionComponent {
  readonly kind: 'DISC';
  readonly componentId: string;
  readonly slotIndex: number;
  readonly gradeCode: GradeCode;
  readonly defectEntries: readonly ConditionDefectEntry[];
  /**
   * Explicit human assertion: no physical defects catalogued for this component.
   * Mutually exclusive with non-empty defectEntries.
   */
  readonly noPhysicalDefectsAsserted: boolean;
  readonly resurfaced: boolean;
  readonly burned: boolean;
}

export const CASE_TYPES = [
  'ORIGINAL_RETAIL',
  'REPLACEMENT_GENERIC',
  'REPLACEMENT_FIRST_PARTY',
  'REPLACEMENT_UNKNOWN_SOURCE',
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

export interface CaseConditionComponent {
  readonly kind: 'CASE';
  readonly componentId: string;
  readonly gradeCode: GradeCode;
  readonly defectEntries: readonly ConditionDefectEntry[];
  readonly noPhysicalDefectsAsserted: boolean;
  /** When true, caseType must be set (replacement / non-original case). */
  readonly replacementCase: boolean;
  readonly caseType: CaseType | undefined;
}

export type ConditionComponent = DiscConditionComponent | CaseConditionComponent;

export interface ConditionEvidenceBinding {
  readonly conditionKey: string;
  readonly refIds: readonly string[];
}

export interface ConditionRecord {
  readonly recordId: string;
  readonly mediaKind: MediaKind;
  /** Expected number of graded disc slots (multi-disc sets must match DISC components). */
  readonly expectedDiscSlotCount: number;
  /** Must be true before any graded signature; enforced structurally. */
  readonly inspectionComplete: boolean;
  readonly completenessTemplateId: string;
  /** Facets explicitly acknowledged present for completeness rules (no inference). */
  readonly acknowledgedCompletenessFacets: readonly string[];
  readonly components: readonly ConditionComponent[];
  readonly overallGradeCode: GradeCode;
  readonly evidenceBindings: readonly ConditionEvidenceBinding[];
}

export interface ConditionSignatureEvent {
  readonly signatureId: string;
  readonly recordId: string;
  readonly completenessHash: string;
  readonly gradingStandardsVersion: string;
  readonly severityCriteriaVersion: string;
  readonly createdAtIso: string;
}
