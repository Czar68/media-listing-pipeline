'use strict';

const fs = require('fs');
const path = require('path');

const { buildExecutionFixture } = require('@media-listing/media-listing-execution-fixture');
const { buildMediaListingPipeline } = require('@media-listing/media-listing-pipeline');
const { buildExecutionPlan } = require('@media-listing/media-listing-execution-planner');
const { runExecutionPlan } = require('@media-listing/media-listing-execution-runner');
const { buildExecutionReport } = require('@media-listing/media-listing-execution-report');
const { buildExecutionBundle } = require('@media-listing/media-listing-execution-bundle');

const fixture = buildExecutionFixture();

const pipeline = buildMediaListingPipeline(fixture);
const plan = buildExecutionPlan(pipeline);
const run = runExecutionPlan(plan);
const report = buildExecutionReport({ executionPlan: plan, executionRun: run });
const bundle = buildExecutionBundle({ executionPlan: plan, executionRun: run });

const snapshot = { fixture, pipeline, plan, run, report, bundle };

const outDir = path.join('artifacts');
const outFile = path.join(outDir, 'media-listing-execution-full-snapshot.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
