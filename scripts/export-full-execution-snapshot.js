'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { buildMediaListingPipeline } = require('@media-listing/media-listing-pipeline');
const { buildExecutionPlan } = require('@media-listing/media-listing-execution-planner');
const { runExecutionPlan } = require('@media-listing/media-listing-execution-runner');
const { buildExecutionBundle } = require('@media-listing/media-listing-execution-bundle');

const FIXED_TS = '2026-04-03T12:00:00.000Z';
const SCAN_ID = 'snap-1';

function deterministicCandidateId(scanId, branch, key, index) {
  const payload = `${scanId}|${index}|${branch}|${key}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

const upcDigits = '5901234123457';
const scanRecord = {
  scanId: SCAN_ID,
  scanSource: 'DISC',
  rawTitle: null,
  rawUPC: upcDigits,
  observedDiscCount: null,
  observedRegion: null,
  timestamp: FIXED_TS,
};

const input = {
  scanRecord,
  identityResolution: {
    requestId: 'req-1',
    selectedCandidateId: deterministicCandidateId(SCAN_ID, 'UPC', upcDigits, 0),
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
      productId: `upc:${upcDigits}`,
      region: 'OTHER',
      mediaFormat: 'OTHER_PHYSICAL',
    },
  ],
};

const mediaListingPipeline = buildMediaListingPipeline(input);
const executionPlan = buildExecutionPlan(mediaListingPipeline);
const executionRun = runExecutionPlan(executionPlan);
const executionBundle = buildExecutionBundle({ executionPlan, executionRun });

const snapshot = { mediaListingPipeline, executionBundle };

const outDir = path.join('artifacts');
const outFile = path.join(outDir, 'media-listing-full-execution-snapshot.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
