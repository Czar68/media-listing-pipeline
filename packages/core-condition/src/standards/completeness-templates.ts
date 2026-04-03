import type { CompletenessTemplate, GradeCode } from '@media-listing/core-domain';

export const COMPLETENESS_TEMPLATES_VERSION = '2026.1.0' as const;

export interface GradeCompletenessFacetRule {
  /** If overall grade is at or above this tier, all facets must be acknowledged. */
  readonly minimumOverallGrade: GradeCode;
  readonly requiredFacetKeys: readonly string[];
}

export interface CompletenessTemplateRules {
  readonly template: CompletenessTemplate;
  readonly gradeFacetRules: readonly GradeCompletenessFacetRule[];
}

const T1: CompletenessTemplateRules = {
  template: {
    templateId: 'physical-media-v1',
    templateVersion: '1',
    label: 'Physical media default',
    /** Keys are enforced only when the underlying defect is asserted (see semantic validator + taxonomy). */
    requiredEvidenceKeys: [],
    requiredRecordKeys: ['recordId', 'inspectionComplete'],
  },
  gradeFacetRules: [
    {
      minimumOverallGrade: 'VERY_GOOD',
      requiredFacetKeys: ['CASE_CLOSEUPS', 'DISC_SURFACE_VISIBLE'],
    },
  ],
};

const REGISTRY: ReadonlyMap<string, CompletenessTemplateRules> = new Map([
  [T1.template.templateId, T1],
]);

export function getCompletenessTemplateRules(
  templateId: string,
): CompletenessTemplateRules | undefined {
  return REGISTRY.get(templateId);
}

export function listCompletenessTemplateIds(): readonly string[] {
  return Array.from(REGISTRY.keys());
}
