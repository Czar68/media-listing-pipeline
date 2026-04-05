'use strict';

const fs = require('fs');
const path = require('path');

const SNAPSHOT_FILE = 'media-listing-execution-full-snapshot.json';
const CONTRACT_FILE = 'media-listing-execution-full-snapshot-contract.json';
const PACKAGE_FILE = 'media-listing-execution-full-snapshot-package.json';

function readJsonArtifact(label, filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`${label} not found (expected at script-relative path): ${filePath}`);
    } else {
      console.error(`Cannot read ${label} at ${filePath}: ${err && err.message ? err.message : err}`);
    }
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in ${label}: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  return data;
}

const repoRoot = path.join(__dirname, '..');
const snapshotPath = path.join(repoRoot, 'artifacts', SNAPSHOT_FILE);
const contractPath = path.join(repoRoot, 'artifacts', CONTRACT_FILE);

const snapshotArtifact = readJsonArtifact('execution full snapshot', snapshotPath);
const contractArtifact = readJsonArtifact('execution full snapshot contract', contractPath);

const packagePayload = {
  snapshotArtifact,
  contractArtifact,
};

const outDir = path.join(repoRoot, 'artifacts');
const outFile = path.join(outDir, PACKAGE_FILE);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(packagePayload, null, 2)}\n`, 'utf8');
