'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT = {
  artifact: 'media-listing-execution-full-snapshot.json',
  requiredTopLevelSections: [
    'fixture',
    'pipeline',
    'plan',
    'run',
    'report',
    'bundle',
  ],
};

const outDir = path.join(__dirname, '..', 'artifacts');
const outFile = path.join(outDir, 'media-listing-execution-full-snapshot-contract.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(CONTRACT, null, 2)}\n`, 'utf8');
