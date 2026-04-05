'use strict';

const fs = require('fs');
const path = require('path');

const PACKAGE_FILE = 'media-listing-execution-full-snapshot-package.json';

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
  const packagePath = path.join(repoRoot, 'artifacts', PACKAGE_FILE);

  const pkg = readJsonFile('execution full snapshot package', packagePath);

  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    console.error(`${PACKAGE_FILE} root must be a JSON object (not an array).`);
    process.exit(1);
  }

  if (!Object.prototype.hasOwnProperty.call(pkg, 'snapshotArtifact')) {
    console.error(`${PACKAGE_FILE} must include top-level key snapshotArtifact.`);
    process.exit(1);
  }

  if (!Object.prototype.hasOwnProperty.call(pkg, 'contractArtifact')) {
    console.error(`${PACKAGE_FILE} must include top-level key contractArtifact.`);
    process.exit(1);
  }

  const snapshotArtifact = pkg.snapshotArtifact;
  const contractArtifact = pkg.contractArtifact;

  if (
    contractArtifact === null ||
    typeof contractArtifact !== 'object' ||
    Array.isArray(contractArtifact)
  ) {
    console.error(`${PACKAGE_FILE} contractArtifact must be a JSON object.`);
    process.exit(1);
  }

  if (!Object.prototype.hasOwnProperty.call(contractArtifact, 'requiredTopLevelSections')) {
    console.error(`${PACKAGE_FILE} contractArtifact.requiredTopLevelSections is missing.`);
    process.exit(1);
  }

  const required = contractArtifact.requiredTopLevelSections;

  if (!Array.isArray(required)) {
    console.error(`${PACKAGE_FILE} contractArtifact.requiredTopLevelSections must be an array.`);
    process.exit(1);
  }

  if (required.some((k) => typeof k !== 'string')) {
    console.error(
      `${PACKAGE_FILE} contractArtifact.requiredTopLevelSections must contain only strings.`
    );
    process.exit(1);
  }

  if (
    snapshotArtifact === null ||
    typeof snapshotArtifact !== 'object' ||
    Array.isArray(snapshotArtifact)
  ) {
    console.error(`${PACKAGE_FILE} snapshotArtifact must be a JSON object.`);
    process.exit(1);
  }

  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(snapshotArtifact, key)
  );
  if (missing.length > 0) {
    console.error(
      `${PACKAGE_FILE} snapshotArtifact is missing contract-required top-level section(s): ${missing.join(', ')}`
    );
    process.exit(1);
  }

  console.log(`OK: ${PACKAGE_FILE} is valid.`);
}

main();
