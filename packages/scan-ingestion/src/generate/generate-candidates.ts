import { createHash } from 'crypto';
import type { IdentityCandidate } from '@media-listing/core-identity';
import { createIdentityCandidateSet } from '@media-listing/core-identity';
import type { CandidateGenerationResult } from '../model/candidate-generation-result';
import type { ScanRecord } from '../model/scan-record';
import { normalizeScan } from '../normalize/normalize-scan';
import { validateScanRecord } from '../validators/validate-scan-record';
import type { DeterministicIdFn } from './upc-matcher';
import { matchUpcCandidates } from './upc-matcher';
import { matchTitleCandidates } from './title-matcher';
import { matchManualCandidates } from './manual-candidate';

function makeDeterministicId(scanId: string): DeterministicIdFn {
  return (branch, key, index) => {
    const payload = `${scanId}|${index}|${branch}|${key}`;
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  };
}

export function generateCandidatesFromScan(record: ScanRecord): CandidateGenerationResult {
  const validated = validateScanRecord(record);
  if (!validated.ok) {
    return {
      kind: 'FAILURE',
      reasons: validated.failures.map((f) => `${f.code}: ${f.message}`),
    };
  }

  const { normalized, warnings: normalizeWarnings } = normalizeScan(validated.value);

  const hasUpc = normalized.normalizedUPC !== null;
  const hasTitle = normalized.normalizedTitle !== null;
  if (!hasUpc && !hasTitle) {
    return { kind: 'FAILURE', reasons: ['MISSING_TITLE_AND_UPC'] };
  }

  const deterministicId = makeDeterministicId(normalized.scanId);
  const allWarnings: string[] = [...normalizeWarnings];

  const candidates: IdentityCandidate[] = [];
  let index = 0;

  const upcOut = matchUpcCandidates(normalized, index, deterministicId);
  candidates.push(...upcOut.candidates);
  index += upcOut.candidates.length;
  allWarnings.push(...upcOut.warnings);

  const titleOut = matchTitleCandidates(normalized, index, deterministicId);
  candidates.push(...titleOut.candidates);
  index += titleOut.candidates.length;
  allWarnings.push(...titleOut.warnings);

  const manualOut = matchManualCandidates(normalized, index, deterministicId);
  candidates.push(...manualOut.candidates);
  allWarnings.push(...manualOut.warnings);

  if (candidates.length === 0) {
    return { kind: 'FAILURE', reasons: ['NO_CANDIDATES_GENERATED'] };
  }

  const candidateSet = createIdentityCandidateSet(candidates);
  if (allWarnings.length > 0) {
    return { kind: 'PARTIAL', candidateSet, warnings: allWarnings };
  }
  return { kind: 'SUCCESS', candidateSet };
}
