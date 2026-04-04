'use strict';

const fs = require('fs');
const path = require('path');

const { buildMediaListingPipeline } = require('@media-listing/media-listing-pipeline');
const { buildExecutionFixture } = require('@media-listing/media-listing-execution-fixture');
const { buildExecutionPlan } = require('@media-listing/media-listing-execution-planner');
const { runExecutionPlan } = require('@media-listing/media-listing-execution-runner');
const { buildExecutionReport } = require('@media-listing/media-listing-execution-report');

const input = buildExecutionFixture();
const pipelineResult = buildMediaListingPipeline(input);
const executionPlan = buildExecutionPlan(pipelineResult);
const executionRun = runExecutionPlan(executionPlan);
const report = buildExecutionReport({ executionPlan, executionRun });

const outDir = path.join('artifacts');
const outFile = path.join(outDir, 'media-listing-execution-report.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
