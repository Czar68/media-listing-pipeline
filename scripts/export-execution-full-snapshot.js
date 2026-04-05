'use strict';

const fs = require('fs');
const path = require('path');

const { buildExecutionFixture } = require('@media-listing/media-listing-execution-fixture');
const { buildMediaListingPipeline } = require('@media-listing/media-listing-pipeline');
const { buildExecutionPlan } = require('@media-listing/media-listing-execution-planner');
const { runExecutionPlan } = require('@media-listing/media-listing-execution-runner');
const { buildExecutionBundle } = require('@media-listing/media-listing-execution-bundle');

const input = buildExecutionFixture();

const mediaListingPipeline = buildMediaListingPipeline(input);
const executionPlan = buildExecutionPlan(mediaListingPipeline);
const executionRun = runExecutionPlan(executionPlan);
const executionBundle = buildExecutionBundle({ executionPlan, executionRun });

const snapshot = { mediaListingPipeline, executionBundle };

const outDir = path.join('artifacts');
const outFile = path.join(outDir, 'media-listing-execution-full-snapshot.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
