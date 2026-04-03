import type { ConditionRecord, DiscConditionComponent, GradeCode } from '@media-listing/core-domain';
import { GRADE_CODES } from '@media-listing/core-domain';
import type { ValidationFailure, ValidationResult } from '@media-listing/core-domain';
import { validationFail, validationOk } from '@media-listing/core-domain';
import { getCompletenessTemplateRules } from '../standards/completeness-templates';

const GRADE_SET = new Set<string>(GRADE_CODES);

function isDisc(
  c: ConditionRecord['components'][number],
): c is DiscConditionComponent {
  return c.kind === 'DISC';
}

/**
 * Structural gates: completeness of inspection, slot coverage, mutual exclusions, replacement case shape.
 * No defaults — missing required assertions are failures.
 */
export function validateConditionStructure(
  record: ConditionRecord,
): ValidationResult<void> {
  const failures: ValidationFailure[] = [];

  if (!record.recordId?.trim()) {
    failures.push({
      code: 'MISSING_RECORD_ID',
      message: 'recordId is required.',
      path: ['recordId'],
    });
  }

  if (!record.inspectionComplete) {
    failures.push({
      code: 'INSPECTION_INCOMPLETE',
      message: 'Inspection must be complete before a condition signature.',
      path: ['inspectionComplete'],
    });
  }

  if (!getCompletenessTemplateRules(record.completenessTemplateId)) {
    failures.push({
      code: 'UNKNOWN_COMPLETENESS_TEMPLATE',
      message: `Unknown completeness template "${record.completenessTemplateId}".`,
      path: ['completenessTemplateId'],
    });
  }

  if (record.expectedDiscSlotCount < 1) {
    failures.push({
      code: 'INVALID_DISC_SLOT_COUNT',
      message: 'expectedDiscSlotCount must be at least 1.',
      path: ['expectedDiscSlotCount'],
    });
  }

  if (record.mediaKind === 'SINGLE_DISC' && record.expectedDiscSlotCount !== 1) {
    failures.push({
      code: 'SINGLE_DISC_SLOT_MISMATCH',
      message: 'Single-disc media must declare exactly one expected disc slot.',
      path: ['expectedDiscSlotCount'],
    });
  }

  if (record.mediaKind === 'MULTI_DISC_SET' && record.expectedDiscSlotCount < 2) {
    failures.push({
      code: 'MULTI_DISC_MIN_SLOTS',
      message: 'Multi-disc sets must declare at least two expected disc slots.',
      path: ['expectedDiscSlotCount'],
    });
  }

  const discs = record.components.filter(isDisc);

  if (discs.length !== record.expectedDiscSlotCount) {
    failures.push({
      code: 'DISC_SLOT_COVERAGE',
      message: `Expected ${record.expectedDiscSlotCount} graded disc component(s), found ${discs.length}.`,
      path: ['components'],
    });
  }

  const slotIndices = new Set<number>();
  for (const d of discs) {
    if (slotIndices.has(d.slotIndex)) {
      failures.push({
        code: 'DUPLICATE_DISC_SLOT',
        message: `Duplicate disc slot index ${d.slotIndex}.`,
        path: ['components', d.componentId],
      });
    }
    slotIndices.add(d.slotIndex);
  }
  for (let i = 0; i < record.expectedDiscSlotCount; i++) {
    if (!slotIndices.has(i)) {
      failures.push({
        code: 'MISSING_DISC_SLOT',
        message: `Missing graded disc for slot index ${i}.`,
        path: ['components'],
      });
    }
  }

  for (const c of record.components) {
    if (!GRADE_SET.has(c.gradeCode as GradeCode)) {
      failures.push({
        code: 'UNKNOWN_GRADE_CODE',
        message: `Unknown grade code on component ${c.componentId}.`,
        path: [c.componentId, 'gradeCode'],
      });
    }
    if (c.noPhysicalDefectsAsserted && c.defectEntries.length > 0) {
      failures.push({
        code: 'NO_DEFECTS_WITH_DEFECT_ENTRIES',
        message: `Component ${c.componentId} cannot assert no defects while listing defects.`,
        path: [c.componentId, 'defectEntries'],
      });
    }
    if (c.kind === 'CASE' && c.replacementCase) {
      if (c.caseType === undefined) {
        failures.push({
          code: 'REPLACEMENT_CASE_TYPE_REQUIRED',
          message: `Case ${c.componentId} is marked replacement but caseType is missing.`,
          path: [c.componentId, 'caseType'],
        });
      }
    }
  }

  if (failures.length > 0) {
    return validationFail(failures);
  }
  return validationOk(undefined);
}
