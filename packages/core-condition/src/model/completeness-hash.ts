import { createHash } from 'crypto';
import type { ConditionRecord } from '@media-listing/core-domain';

/**
 * Deterministic hash over material condition fields — any material change alters the digest.
 */
export function computeCompletenessHash(record: ConditionRecord): string {
  const payload = stableStringifyForHash(record);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function stableStringifyForHash(record: ConditionRecord): string {
  const discComponents = record.components
    .filter((c) => c.kind === 'DISC')
    .map((c) => ({
      kind: c.kind,
      componentId: c.componentId,
      slotIndex: c.slotIndex,
      gradeCode: c.gradeCode,
      defectCodes: [...c.defectEntries.map((d) => d.defectCode)].sort(),
      noPhysicalDefectsAsserted: c.noPhysicalDefectsAsserted,
      resurfaced: c.resurfaced,
      burned: c.burned,
    }))
    .sort((a, b) => a.componentId.localeCompare(b.componentId));

  const caseComponents = record.components
    .filter((c) => c.kind === 'CASE')
    .map((c) => ({
      kind: c.kind,
      componentId: c.componentId,
      gradeCode: c.gradeCode,
      defectCodes: [...c.defectEntries.map((d) => d.defectCode)].sort(),
      noPhysicalDefectsAsserted: c.noPhysicalDefectsAsserted,
      replacementCase: c.replacementCase,
      caseType: c.caseType ?? null,
    }))
    .sort((a, b) => a.componentId.localeCompare(b.componentId));

  const evidence = [...record.evidenceBindings]
    .map((e) => ({
      conditionKey: e.conditionKey,
      refIds: [...e.refIds].sort(),
    }))
    .sort((a, b) => a.conditionKey.localeCompare(b.conditionKey));

  const envelope = {
    recordId: record.recordId,
    mediaKind: record.mediaKind,
    expectedDiscSlotCount: record.expectedDiscSlotCount,
    inspectionComplete: record.inspectionComplete,
    completenessTemplateId: record.completenessTemplateId,
    acknowledgedCompletenessFacets: [...record.acknowledgedCompletenessFacets].sort(),
    overallGradeCode: record.overallGradeCode,
    discComponents,
    caseComponents,
    evidenceBindings: evidence,
  };

  return JSON.stringify(envelope);
}
