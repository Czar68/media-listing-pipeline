'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_FILE = 'media-listing-execution-full-snapshot-contract.json';
const SNAPSHOT_FILE = 'media-listing-execution-full-snapshot.json';

function readJsonFile(label, filePath) {
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

function main() {
  const repoRoot = path.join(__dirname, '..');
  const contractPath = path.join(repoRoot, 'artifacts', CONTRACT_FILE);
  const snapshotPath = path.join(repoRoot, 'artifacts', SNAPSHOT_FILE);

  const contract = readJsonFile('execution full snapshot contract', contractPath);

  if (contract === null || typeof contract !== 'object' || Array.isArray(contract)) {
    console.error(`${CONTRACT_FILE} must be a JSON object at the top level.`);
    process.exit(1);
  }

  const artifactName = contract.artifact;
  const required = contract.requiredTopLevelSections;

  if (typeof artifactName !== 'string' || artifactName !== SNAPSHOT_FILE) {
    console.error(
      `${CONTRACT_FILE} must declare artifact "${SNAPSHOT_FILE}" (found: ${JSON.stringify(contract.artifact)}).`
    );
    process.exit(1);
  }

  if (!Array.isArray(required) || required.some((k) => typeof k !== 'string')) {
    console.error(`${CONTRACT_FILE} must include requiredTopLevelSections as an array of strings.`);
    process.exit(1);
  }

  const snapshot = readJsonFile('execution full snapshot', snapshotPath);

  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    console.error(`${SNAPSHOT_FILE} must be a JSON object at the top level.`);
    process.exit(1);
  }

  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(snapshot, key));
  if (missing.length > 0) {
    console.error(
      `${SNAPSHOT_FILE} is missing contract-required top-level section(s): ${missing.join(', ')}`
    );
    process.exit(1);
  }

  console.log(`OK: ${SNAPSHOT_FILE} satisfies ${CONTRACT_FILE}.`);
}

main();
