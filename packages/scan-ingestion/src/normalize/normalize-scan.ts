import type { NormalizedScan } from '../model/normalized-scan';
import type { ScanRecord } from '../model/scan-record';

const VALID_UPC_DIGIT_LENGTHS = new Set([8, 12, 13]);

function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

function digitsOnly(raw: string | null): string {
  if (raw === null) {
    return '';
  }
  return raw.replace(/\D/g, '');
}

export interface NormalizeScanOutput {
  readonly normalized: NormalizedScan;
  readonly warnings: readonly string[];
}

/**
 * Trims strings, normalizes UPC digits, preserves null observations.
 */
export function normalizeScan(record: ScanRecord): NormalizeScanOutput {
  const warnings: string[] = [];

  let normalizedTitle: string | null = null;
  if (record.rawTitle !== null) {
    const collapsed = collapseWhitespace(record.rawTitle);
    normalizedTitle = collapsed.length > 0 ? collapsed : null;
  }

  let normalizedUPC: string | null = null;
  const upcDigits = digitsOnly(record.rawUPC);
  if (record.rawUPC !== null && record.rawUPC.trim().length > 0) {
    if (!VALID_UPC_DIGIT_LENGTHS.has(upcDigits.length)) {
      warnings.push('INVALID_UPC_FORMAT');
      normalizedUPC = null;
    } else {
      normalizedUPC = upcDigits;
    }
  }

  const observedDiscCount: number | null = record.observedDiscCount;

  const normalized: NormalizedScan = {
    scanId: record.scanId,
    scanSource: record.scanSource,
    normalizedTitle,
    normalizedUPC,
    observedDiscCount,
    observedRegion: record.observedRegion,
    discFingerprints: record.discFingerprints !== undefined ? [...record.discFingerprints] : undefined,
    timestamp: record.timestamp,
  };

  return { normalized, warnings };
}
