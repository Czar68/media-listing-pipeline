import { describe, expect, it } from 'vitest';
import type { IdentityCandidate } from '@media-listing/core-identity';
import { createIdentityCandidateSet } from '@media-listing/core-identity';
import type { IdentityResolutionRequest } from '../../src/model/identity-resolution-request';
import { applyIdentityResolution } from '../../src/apply/apply-identity-resolution';
import { buildResolutionAuditRecord } from '../../src/apply/build-resolution-audit-record';

const TS = '2026-04-03T12:00:00.000Z';

function baseCandidate(overrides: Partial<IdentityCandidate> = {}): IdentityCandidate {
  return {
    candidateId: 'cand-1',
    productId: 'prod-1',
    source: 'CATALOG',
    confidence: 'HIGH',
    title: 'Test Title',
    mediaType: 'BLU_RAY',
    region: 'NTSC_U',
    discCount: 1,
    ...overrides,
  };
}

const alignmentMatch = {
  observedDiscSlotCount: 1,
  observedRegionCode: 'NTSC_U' as const,
};

function baseRequest(overrides: Partial<IdentityResolutionRequest> = {}): IdentityResolutionRequest {
  return {
    requestId: 'req-1',
    candidateSet: createIdentityCandidateSet([baseCandidate()]),
    selectedCandidateId: 'cand-1',
    operatorId: 'op-1',
    rationale: null,
    requestedAt: TS,
    alignmentProbe: alignmentMatch,
    ...overrides,
  };
}

describe('identity application oracle proofs', () => {
  it('1. explicit valid selectedCandidateId produces RESOLVED', () => {
    const result = applyIdentityResolution(baseRequest());
    expect(result.kind).toBe('RESOLVED');
  });

  it('2. null selectedCandidateId with single candidate does not auto-resolve', () => {
    const result = applyIdentityResolution(
      baseRequest({
        selectedCandidateId: null,
        candidateSet: createIdentityCandidateSet([baseCandidate()]),
      }),
    );
    expect(result.kind).toBe('CONFLICT');
    if (result.kind === 'CONFLICT') {
      expect(result.conflicts.some((c) => c.kind === 'INSUFFICIENT_DATA' && c.reason === 'SELECTION_REQUIRED')).toBe(
        true,
      );
    }
  });

  it('3. multiple candidates with null selection preserves ambiguity / conflict', () => {
    const result = applyIdentityResolution(
      baseRequest({
        selectedCandidateId: null,
        candidateSet: createIdentityCandidateSet([
          baseCandidate({ candidateId: 'a', productId: 'p1' }),
          baseCandidate({ candidateId: 'b', productId: 'p2' }),
        ]),
      }),
    );
    expect(result.kind).toBe('CONFLICT');
    if (result.kind === 'CONFLICT') {
      const m = result.conflicts.find((c) => c.kind === 'MULTI_MATCH_AMBIGUITY');
      expect(m?.kind).toBe('MULTI_MATCH_AMBIGUITY');
      if (m?.kind === 'MULTI_MATCH_AMBIGUITY') {
        expect(m.orderedCandidateIds).toEqual(['a', 'b']);
      }
    }
  });

  it('4. unknown selectedCandidateId does not resolve', () => {
    const result = applyIdentityResolution(
      baseRequest({
        selectedCandidateId: 'nope',
      }),
    );
    expect(result.kind).toBe('CONFLICT');
    if (result.kind === 'CONFLICT') {
      expect(result.conflicts.some((c) => c.kind === 'INSUFFICIENT_DATA' && c.reason === 'UNKNOWN_SELECTED_ID')).toBe(
        true,
      );
    }
  });

  it('5. RESOLVED result includes identitySnapshot', () => {
    const result = applyIdentityResolution(baseRequest());
    expect(result.kind).toBe('RESOLVED');
    if (result.kind === 'RESOLVED') {
      expect(result.identitySnapshot.snapshotId.length).toBeGreaterThan(0);
      expect(result.identitySnapshot.candidate.candidateId).toBe('cand-1');
    }
  });

  it('6. non-resolved result does not include identitySnapshot', () => {
    const conflict = applyIdentityResolution(
      baseRequest({
        selectedCandidateId: null,
      }),
    );
    expect(conflict.kind).toBe('CONFLICT');
    expect('identitySnapshot' in conflict).toBe(false);

    const research = applyIdentityResolution(
      baseRequest({
        candidateSet: createIdentityCandidateSet([]),
        selectedCandidateId: null,
        alignmentProbe: null,
      }),
    );
    expect(research.kind).toBe('RESEARCH_REQUIRED');
    expect('identitySnapshot' in research).toBe(false);
  });

  it('7. conflict type passes through unchanged', () => {
    const result = applyIdentityResolution(
      baseRequest({
        candidateSet: createIdentityCandidateSet([baseCandidate({ region: 'PAL_UK' })]),
      }),
    );
    expect(result.kind).toBe('CONFLICT');
    if (result.kind === 'CONFLICT') {
      const r = result.conflicts.find((c) => c.kind === 'REGION_CONFLICT');
      expect(r?.kind).toBe('REGION_CONFLICT');
      if (r?.kind === 'REGION_CONFLICT') {
        expect(r.catalogRegion).toBe('PAL_UK');
        expect(r.observedRegion).toBe('NTSC_U');
      }
    }
  });

  it('8. same request input produces identical result', () => {
    const req = baseRequest();
    const a = applyIdentityResolution(req);
    const b = applyIdentityResolution(req);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('9. audit record is generated correctly for RESOLVED', () => {
    const req = baseRequest({ rationale: 'picked' });
    const result = applyIdentityResolution(req);
    expect(result.kind).toBe('RESOLVED');
    const audit = buildResolutionAuditRecord(req, result);
    expect(audit.outcomeType).toBe('RESOLVED');
    expect(audit.snapshotId).toBe(result.kind === 'RESOLVED' ? result.identitySnapshot.snapshotId : null);
    expect(audit.requestId).toBe('req-1');
    expect(audit.operatorId).toBe('op-1');
    expect(audit.selectedCandidateId).toBe('cand-1');
    expect(audit.requestedAt).toBe(TS);
    expect(audit.rationale).toBe('picked');
  });

  it('10. audit record is generated correctly for CONFLICT / RESEARCH_REQUIRED', () => {
    const reqConflict = baseRequest({ selectedCandidateId: null });
    const conflict = applyIdentityResolution(reqConflict);
    expect(conflict.kind).toBe('CONFLICT');
    const auditC = buildResolutionAuditRecord(reqConflict, conflict);
    expect(auditC.outcomeType).toBe('CONFLICT');
    expect(auditC.snapshotId).toBeNull();

    const reqResearch = baseRequest({
      candidateSet: createIdentityCandidateSet([]),
      selectedCandidateId: null,
      alignmentProbe: null,
    });
    const research = applyIdentityResolution(reqResearch);
    expect(research.kind).toBe('RESEARCH_REQUIRED');
    const auditR = buildResolutionAuditRecord(reqResearch, research);
    expect(auditR.outcomeType).toBe('RESEARCH_REQUIRED');
    expect(auditR.snapshotId).toBeNull();
  });
});
