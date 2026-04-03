import { describe, expect, it } from 'vitest';
import type { IdentityCandidate } from '../../src/model/identity-candidate';
import { createIdentityCandidateSet } from '../../src/model/identity-candidate-set';
import { resolveIdentity } from '../../src/rules/identity-conflict-detection';

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

describe('identity oracle proofs', () => {
  it('1. single HIGH candidate → can resolve only with explicit selection', () => {
    const c = baseCandidate({ confidence: 'HIGH' });
    const set = createIdentityCandidateSet([c]);
    const without = resolveIdentity({
      candidateSet: set,
      selectedCandidateId: undefined,
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(without.outcome).toBe('CONFLICT');
    if (without.outcome === 'CONFLICT') {
      expect(without.conflicts.some((x) => x.kind === 'INSUFFICIENT_DATA')).toBe(true);
    }

    const withSel = resolveIdentity({
      candidateSet: set,
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: 'picked',
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(withSel.outcome).toBe('RESOLVED');
    if (withSel.outcome === 'RESOLVED') {
      expect(withSel.resolved.selectedCandidateId).toBe('cand-1');
      expect(withSel.snapshot.candidate.confidence).toBe('HIGH');
    }
  });

  it('2. multiple candidates → requires selection (no auto resolve)', () => {
    const set = createIdentityCandidateSet([
      baseCandidate({ candidateId: 'a', productId: 'p1' }),
      baseCandidate({ candidateId: 'b', productId: 'p2' }),
    ]);
    const r = resolveIdentity({
      candidateSet: set,
      selectedCandidateId: undefined,
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(r.outcome).toBe('CONFLICT');
    if (r.outcome === 'CONFLICT') {
      expect(r.conflicts.some((x) => x.kind === 'MULTI_MATCH_AMBIGUITY')).toBe(true);
    }
  });

  it('3. no candidates → RESEARCH_REQUIRED', () => {
    const r = resolveIdentity({
      candidateSet: createIdentityCandidateSet([]),
      selectedCandidateId: undefined,
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 0, observedRegionCode: 'REGION_FREE' },
    });
    expect(r.outcome).toBe('RESEARCH_REQUIRED');
  });

  it('4. disc mismatch → MISMATCHED_DISC', () => {
    const c = baseCandidate({ discCount: 2 });
    const r = resolveIdentity({
      candidateSet: createIdentityCandidateSet([c]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(r.outcome).toBe('CONFLICT');
    if (r.outcome === 'CONFLICT') {
      expect(r.conflicts.some((x) => x.kind === 'MISMATCHED_DISC')).toBe(true);
    }
  });

  it('5. region mismatch → REGION_CONFLICT', () => {
    const c = baseCandidate({ region: 'PAL_UK' });
    const r = resolveIdentity({
      candidateSet: createIdentityCandidateSet([c]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(r.outcome).toBe('CONFLICT');
    if (r.outcome === 'CONFLICT') {
      expect(r.conflicts.some((x) => x.kind === 'REGION_CONFLICT')).toBe(true);
    }
  });

  it('6. snapshot immutability: identity change invalidates prior snapshot', () => {
    const a = resolveIdentity({
      candidateSet: createIdentityCandidateSet([baseCandidate({ productId: 'P-A' })]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    const b = resolveIdentity({
      candidateSet: createIdentityCandidateSet([baseCandidate({ productId: 'P-B' })]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(a.outcome).toBe('RESOLVED');
    expect(b.outcome).toBe('RESOLVED');
    if (a.outcome === 'RESOLVED' && b.outcome === 'RESOLVED') {
      expect(a.snapshot.snapshotId).not.toBe(b.snapshot.snapshotId);
    }
  });

  it('7. confidence does NOT change behavior', () => {
    const low = resolveIdentity({
      candidateSet: createIdentityCandidateSet([baseCandidate({ confidence: 'LOW' })]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    const high = resolveIdentity({
      candidateSet: createIdentityCandidateSet([baseCandidate({ confidence: 'HIGH' })]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(low.outcome).toBe('RESOLVED');
    expect(high.outcome).toBe('RESOLVED');
    if (low.outcome === 'RESOLVED' && high.outcome === 'RESOLVED') {
      expect(low.snapshot.snapshotId).toBe(high.snapshot.snapshotId);
    }
  });

  it('8. deterministic output: identical input → identical output', () => {
    const input = {
      candidateSet: createIdentityCandidateSet([baseCandidate()]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' as const },
    };
    const x = resolveIdentity(input);
    const y = resolveIdentity(input);
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
  });

  it('9. conflict blocks resolution: cannot produce RESOLVED if conflict exists', () => {
    const r = resolveIdentity({
      candidateSet: createIdentityCandidateSet([baseCandidate({ discCount: 2 })]),
      selectedCandidateId: 'cand-1',
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(r.outcome).toBe('CONFLICT');
    expect(r.outcome === 'RESOLVED').toBe(false);
  });

  it('10. candidate ordering preserved in MULTI_MATCH_AMBIGUITY', () => {
    const r = resolveIdentity({
      candidateSet: createIdentityCandidateSet([
        baseCandidate({ candidateId: 'first' }),
        baseCandidate({ candidateId: 'second', productId: 'p2' }),
      ]),
      selectedCandidateId: undefined,
      operatorId: 'op-1',
      rationale: undefined,
      resolvedAt: TS,
      alignment: { observedDiscSlotCount: 1, observedRegionCode: 'NTSC_U' },
    });
    expect(r.outcome).toBe('CONFLICT');
    if (r.outcome === 'CONFLICT') {
      const m = r.conflicts.find((c) => c.kind === 'MULTI_MATCH_AMBIGUITY');
      expect(m?.kind).toBe('MULTI_MATCH_AMBIGUITY');
      if (m?.kind === 'MULTI_MATCH_AMBIGUITY') {
        expect(m.orderedCandidateIds).toEqual(['first', 'second']);
      }
    }
  });
});
