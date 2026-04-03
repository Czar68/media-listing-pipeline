import { describe, expect, it } from 'vitest';
import type {
  ConditionRecord,
  DiscConditionComponent,
  IdentityAlignmentInput,
} from '@media-listing/core-domain';
import {
  computeCompletenessHash,
  evaluateConditionSignature,
  evaluateIdentityAlignment,
} from '../../src/index';

const TEMPLATE = 'physical-media-v1' as const;

function disc(overrides: Partial<DiscConditionComponent>): DiscConditionComponent {
  return {
    kind: 'DISC',
    componentId: 'disc-0',
    slotIndex: 0,
    gradeCode: 'GOOD',
    defectEntries: [],
    noPhysicalDefectsAsserted: true,
    resurfaced: false,
    burned: false,
    ...overrides,
  };
}

function baseRecord(overrides: Partial<ConditionRecord> = {}): ConditionRecord {
  return {
    recordId: 'rec-oracle',
    mediaKind: 'SINGLE_DISC',
    expectedDiscSlotCount: 1,
    inspectionComplete: true,
    completenessTemplateId: TEMPLATE,
    acknowledgedCompletenessFacets: [],
    components: [disc({})],
    overallGradeCode: 'GOOD',
    evidenceBindings: [],
    ...overrides,
  };
}

describe('oracle proofs', () => {
  it('1. single-disc clean item can produce valid condition signature', () => {
    const record = baseRecord();
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-1',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('SIGNATURE_VALID');
    if (result.outcome === 'SIGNATURE_VALID') {
      expect(result.signature.completenessHash).toHaveLength(64);
      expect(result.signature.recordId).toBe(record.recordId);
    }
  });

  it('2. multi-disc set missing one disc fails', () => {
    const record = baseRecord({
      mediaKind: 'MULTI_DISC_SET',
      expectedDiscSlotCount: 2,
      components: [disc({ componentId: 'd0', slotIndex: 0 })],
      overallGradeCode: 'GOOD',
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-2',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(result.failures.some((f) => f.code === 'DISC_SLOT_COVERAGE')).toBe(true);
    }
  });

  it('3. grade above worst component fails', () => {
    const record = baseRecord({
      mediaKind: 'MULTI_DISC_SET',
      expectedDiscSlotCount: 2,
      components: [
        disc({ componentId: 'd0', slotIndex: 0, gradeCode: 'GOOD' }),
        disc({ componentId: 'd1', slotIndex: 1, gradeCode: 'FAIR' }),
      ],
      overallGradeCode: 'VERY_GOOD',
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-3',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(result.failures.some((f) => f.code === 'OVERALL_EXCEEDS_WORST_COMPONENT')).toBe(
        true,
      );
    }
  });

  it('4. resurfaced disc above ceiling fails', () => {
    const record = baseRecord({
      components: [disc({ gradeCode: 'EXCELLENT', resurfaced: true })],
      overallGradeCode: 'EXCELLENT',
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-4',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(result.failures.some((f) => f.code === 'RESURFACED_GRADE_CEILING')).toBe(true);
    }
  });

  it('5. burned disc blocks', () => {
    const record = baseRecord({
      components: [disc({ burned: true })],
      overallGradeCode: 'GOOD',
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-5',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('BLOCKED_AUTHENTICITY');
  });

  it('6. replacement case recorded correctly (explicit caseType)', () => {
    const record = baseRecord({
      components: [
        disc({ componentId: 'd0' }),
        {
          kind: 'CASE',
          componentId: 'case-1',
          gradeCode: 'GOOD',
          defectEntries: [],
          noPhysicalDefectsAsserted: true,
          replacementCase: true,
          caseType: 'REPLACEMENT_GENERIC',
        },
      ],
      overallGradeCode: 'GOOD',
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-6',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('SIGNATURE_VALID');
  });

  it('7. no-defects + defect entry fails', () => {
    const record = baseRecord({
      components: [
        disc({
          noPhysicalDefectsAsserted: true,
          defectEntries: [{ defectCode: 'SCRATCH_LIGHT' }],
        }),
      ],
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-7',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(result.failures.some((f) => f.code === 'NO_DEFECTS_WITH_DEFECT_ENTRIES')).toBe(
        true,
      );
    }
  });

  it('8. mismatch creates identity conflict outcome', () => {
    const alignment: IdentityAlignmentInput = {
      slots: [
        {
          slotIndex: 0,
          catalogFingerprint: 'cat-a',
          observedFingerprint: 'obs-b',
        },
      ],
      catalogRegionCode: 'PAL-UK',
      observedRegionCode: 'PAL-UK',
    };
    expect(evaluateIdentityAlignment(alignment)).toBe('MISMATCHED_DISC');
    const record = baseRecord();
    const result = evaluateConditionSignature({
      record,
      identityAlignment: alignment,
      signatureId: 'sig-8',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('IDENTITY_CONFLICT');
    if (result.outcome === 'IDENTITY_CONFLICT') {
      expect(result.reason).toBe('MISMATCHED_DISC');
    }
  });

  it('9. region conflict creates identity conflict outcome', () => {
    const alignment: IdentityAlignmentInput = {
      slots: [
        {
          slotIndex: 0,
          catalogFingerprint: 'fp',
          observedFingerprint: 'fp',
        },
      ],
      catalogRegionCode: 'NTSC-U',
      observedRegionCode: 'PAL-UK',
    };
    expect(evaluateIdentityAlignment(alignment)).toBe('REGION_CONFLICT');
    const result = evaluateConditionSignature({
      record: baseRecord(),
      identityAlignment: alignment,
      signatureId: 'sig-9',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('IDENTITY_CONFLICT');
  });

  it('10. required fields missing fails (inspection incomplete)', () => {
    const record = baseRecord({ inspectionComplete: false });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-10',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(result.failures.some((f) => f.code === 'INSPECTION_INCOMPLETE')).toBe(true);
    }
  });

  it('11. completeness hash changes when material condition data changes', () => {
    const a = baseRecord({ overallGradeCode: 'GOOD' });
    const b = baseRecord({ overallGradeCode: 'FAIR' });
    expect(computeCompletenessHash(a)).not.toBe(computeCompletenessHash(b));
  });

  it('12. semantic contradiction between grade and defect fails', () => {
    const record = baseRecord({
      components: [
        disc({
          gradeCode: 'EXCELLENT',
          defectEntries: [{ defectCode: 'SCRATCH_DEEP' }],
          noPhysicalDefectsAsserted: false,
        }),
      ],
      overallGradeCode: 'EXCELLENT',
      evidenceBindings: [{ conditionKey: 'DEFECT:SCRATCH_DEEP', refIds: ['ev-1'] }],
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-12',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(
        result.failures.some((f) => f.code === 'GRADE_DEFECT_SEMANTIC_CONTRADICTION'),
      ).toBe(true);
    }
  });

  it('13. semantic contradiction between completeness and grade fails', () => {
    const record = baseRecord({
      components: [disc({ gradeCode: 'EXCELLENT' })],
      overallGradeCode: 'EXCELLENT',
      acknowledgedCompletenessFacets: [],
    });
    const result = evaluateConditionSignature({
      record,
      signatureId: 'sig-13',
      createdAtIso: '2026-04-03T12:00:00.000Z',
    });
    expect(result.outcome).toBe('VALIDATION_FAILED');
    if (result.outcome === 'VALIDATION_FAILED') {
      expect(
        result.failures.some((f) => f.code === 'COMPLETENESS_GRADE_CONTRADICTION'),
      ).toBe(true);
    }
  });
});
