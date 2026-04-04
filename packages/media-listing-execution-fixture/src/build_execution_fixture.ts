import * as crypto from 'crypto';
import type { MediaListingPipelineInput } from '@media-listing/media-listing-pipeline';

const FIXED_TS = '2026-04-03T12:00:00.000Z';
const SCAN_ID = 'snap-1';

function deterministicCandidateId(scanId: string, branch: string, key: string, index: number): string {
  const payload = `${scanId}|${index}|${branch}|${key}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

const UPC_DIGITS = '5901234123457';

export function buildExecutionFixture(): MediaListingPipelineInput {
  const scanRecord = {
    scanId: SCAN_ID,
    scanSource: 'DISC' as const,
    rawTitle: null,
    rawUPC: UPC_DIGITS,
    observedDiscCount: null,
    observedRegion: null,
    timestamp: FIXED_TS,
  };

  return {
    scanRecord,
    identityResolution: {
      requestId: 'req-1',
      selectedCandidateId: deterministicCandidateId(SCAN_ID, 'UPC', UPC_DIGITS, 0),
      operatorId: 'op-1',
      rationale: null,
      requestedAt: FIXED_TS,
      alignmentProbe: {
        observedDiscSlotCount: 1,
        observedRegionCode: 'OTHER',
      },
    },
    catalogRecords: [
      {
        title: 'Snapshot Catalog Row',
        productId: `upc:${UPC_DIGITS}`,
        region: 'OTHER' as const,
        mediaFormat: 'OTHER_PHYSICAL' as const,
      },
    ],
  };
}
