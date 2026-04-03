import { describe, expect, it } from 'vitest';
import type { ScanRecord } from '../../src/model/scan-record';
import { generateCandidatesFromScan } from '../../src/generate/generate-candidates';
import { normalizeScan } from '../../src/normalize/normalize-scan';
import { validateScanRecord } from '../../src/validators/validate-scan-record';

const TS = '2026-04-03T12:00:00.000Z';

function baseRecord(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    scanId: 'scan-1',
    scanSource: 'DISC',
    rawTitle: null,
    rawUPC: null,
    observedDiscCount: null,
    observedRegion: null,
    timestamp: TS,
    ...overrides,
  };
}

describe('scan ingestion oracle proofs', () => {
  it('1. UPC-only scan → HIGH confidence UPC candidate', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        rawUPC: '5901234123457',
        rawTitle: null,
      }),
    );
    expect(r.kind === 'SUCCESS' || r.kind === 'PARTIAL').toBe(true);
    if (r.kind === 'SUCCESS' || r.kind === 'PARTIAL') {
      const upc = r.candidateSet.candidates.filter((c) => c.source === 'UPC');
      expect(upc).toHaveLength(1);
      expect(upc[0]?.confidence).toBe('HIGH');
    }
  });

  it('2. Title-only scan → MEDIUM CATALOG candidate', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        rawTitle: '  Some  Film  ',
        rawUPC: null,
      }),
    );
    expect(r.kind).toBe('SUCCESS');
    if (r.kind === 'SUCCESS') {
      const cat = r.candidateSet.candidates.filter((c) => c.source === 'CATALOG');
      expect(cat).toHaveLength(1);
      expect(cat[0]?.confidence).toBe('MEDIUM');
      expect(cat[0]?.title).toBe('Some Film');
    }
  });

  it('3. Manual scan → LOW MANUAL candidate', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        scanSource: 'MANUAL',
        rawTitle: 'Operator Entry',
        rawUPC: null,
      }),
    );
    expect(r.kind === 'SUCCESS' || r.kind === 'PARTIAL').toBe(true);
    if (r.kind === 'SUCCESS' || r.kind === 'PARTIAL') {
      const man = r.candidateSet.candidates.filter((c) => c.source === 'MANUAL');
      expect(man.some((c) => c.confidence === 'LOW')).toBe(true);
    }
  });

  it('4. Multiple sources → candidates preserved in generation order', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        scanSource: 'MANUAL',
        rawUPC: '5901234123457',
        rawTitle: 'Catalog Title',
      }),
    );
    expect(r.kind === 'SUCCESS' || r.kind === 'PARTIAL').toBe(true);
    if (r.kind === 'SUCCESS' || r.kind === 'PARTIAL') {
      const sources = r.candidateSet.candidates.map((c) => c.source);
      expect(sources).toEqual(['UPC', 'CATALOG', 'MANUAL']);
    }
  });

  it('5. No UPC + no title → FAILURE', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        rawTitle: null,
        rawUPC: null,
      }),
    );
    expect(r.kind).toBe('FAILURE');
    if (r.kind === 'FAILURE') {
      expect(r.reasons.some((x) => x.includes('MISSING_TITLE_AND_UPC'))).toBe(true);
    }
  });

  it('6. Invalid UPC → warning but title still processed', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        rawUPC: '12',
        rawTitle: 'Valid Title',
      }),
    );
    expect(r.kind).toBe('PARTIAL');
    if (r.kind === 'PARTIAL') {
      expect(r.warnings).toContain('INVALID_UPC_FORMAT');
      expect(r.candidateSet.candidates.some((c) => c.source === 'CATALOG')).toBe(true);
    }
  });

  it('7. Determinism: same ScanRecord → identical output', () => {
    const rec = baseRecord({
      rawUPC: '5901234123457',
      rawTitle: 'T',
    });
    const a = generateCandidatesFromScan(rec);
    const b = generateCandidatesFromScan(rec);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('8. No auto-selection: result is candidate set, never resolved identity', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        rawTitle: 'Only Title',
        rawUPC: null,
      }),
    );
    expect('outcome' in r).toBe(false);
    expect(r.kind === 'SUCCESS' || r.kind === 'PARTIAL').toBe(true);
  });

  it('9. No inference: missing disc count stays null on NormalizedScan', () => {
    const rec = baseRecord({
      rawTitle: 'X',
      observedDiscCount: null,
    });
    const v = validateScanRecord(rec);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const { normalized } = normalizeScan(v.value);
      expect(normalized.observedDiscCount).toBeNull();
    }
  });

  it('10. Candidate ordering preserved exactly', () => {
    const r = generateCandidatesFromScan(
      baseRecord({
        rawUPC: '5901234123457',
        rawTitle: 'Y',
      }),
    );
    expect(r.kind).toBe('SUCCESS');
    if (r.kind === 'SUCCESS') {
      const ids = r.candidateSet.candidates.map((c) => c.candidateId);
      const ids2 = r.candidateSet.candidates.map((c) => c.candidateId);
      expect(ids).toEqual(ids2);
      expect(r.candidateSet.candidates.map((c) => c.source)).toEqual(['UPC', 'CATALOG']);
    }
  });
});
