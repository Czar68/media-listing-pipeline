'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_FILE = 'media-listing-deterministic-execution-contract.json';

const REQUIRED_TOP_LEVEL = [
  'executionSurfacePackage',
  'executionSurfacePackageContract',
  'executionSurfacePackagePackage',
];

const EXPECTED_RELATIVE_PATH = {
  executionSurfacePackage: 'artifacts/media-listing-deterministic-execution-surface-package.json',
  executionSurfacePackageContract: 'artifacts/media-listing-deterministic-execution-surface-package-contract.json',
  executionSurfacePackagePackage: 'artifacts/media-listing-deterministic-execution-surface-package-package.json',
};

const repoRoot = path.join(__dirname, '..');

function ensureJsonArtifact(relPath) {
  const abs = path.join(repoRoot, ...relPath.split('/'));
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`Missing required artifact (expected at script-relative path): ${relPath}`);
    } else {
      console.error(`Cannot read ${relPath}: ${err && err.message ? err.message : err}`);
    }
    process.exit(1);
  }
  try {
    JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in ${relPath}: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
}

const contractPayload = {};

for (const key of REQUIRED_TOP_LEVEL) {
  const relPath = EXPECTED_RELATIVE_PATH[key];
  ensureJsonArtifact(relPath);
  contractPayload[key] = { relativePath: relPath };
}

const outDir = path.join(repoRoot, 'artifacts');
const outPath = path.join(outDir, CONTRACT_FILE);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(contractPayload, null, 2)}\n`, 'utf8');

console.log(`OK: wrote artifacts/${CONTRACT_FILE}`);
