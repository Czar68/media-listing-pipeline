'use strict';

const fs = require('fs');
const path = require('path');

const { buildMediaListingPipeline } = require('@media-listing/media-listing-pipeline');
const { buildExecutionFixture } = require('@media-listing/media-listing-execution-fixture');

const input = buildExecutionFixture();
const result = buildMediaListingPipeline(input);

const outDir = path.join('artifacts', 'media-listing');
const outFile = path.join(outDir, 'pipeline-snapshot.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
