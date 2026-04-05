'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT = 'media-listing-deterministic-execution-surface-package.json';

const REQUIRED_TOP_LEVEL = [
  'executionFullSnapshotContract',
  'executionFullSnapshotPackage',
  'executionStackPackageContract',
  'executionStackPackagePackage',
];

const EXPECTED_RELATIVE_PATH = {
  executionFullSnapshotContract: 'artifacts/media-listing-execution-full-snapshot-contract.json',
  executionFullSnapshotPackage: 'artifacts/media-listing-execution-full-snapshot-package.json',
  executionStackPackageContract: 'artifacts/media-listing-deterministic-execution-stack-package-contract.json',
  executionStackPackagePackage: 'artifacts/media-listing-deterministic-execution-stack-package-package.json',
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function main() {
  const artifactPath = path.join(__dirname, '..', 'artifacts', ARTIFACT);

  let raw;
  try {
    raw = fs.readFileSync(artifactPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`Deterministic execution surface package not found (expected at script-relative path): ${artifactPath}`);
    } else {
      console.error(`Cannot read deterministic execution surface package at ${artifactPath}: ${err && err.message ? err.message : err}`);
    }
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in ${ARTIFACT}: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  if (!isPlainObject(data)) {
    console.error(`${ARTIFACT} must be a plain JSON object at the top level.`);
    process.exit(1);
  }

  const actualKeys = Object.keys(data);
  if (actualKeys.length !== REQUIRED_TOP_LEVEL.length) {
    console.error(
      `${ARTIFACT} must have exactly ${REQUIRED_TOP_LEVEL.length} top-level keys (found ${actualKeys.length}).`
    );
    process.exit(1);
  }

  const missing = REQUIRED_TOP_LEVEL.filter((key) => !Object.prototype.hasOwnProperty.call(data, key));
  if (missing.length > 0) {
    console.error(`${ARTIFACT} is missing top-level key(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  const extras = actualKeys.filter((key) => !REQUIRED_TOP_LEVEL.includes(key));
  if (extras.length > 0) {
    console.error(`${ARTIFACT} has unexpected top-level key(s): ${extras.join(', ')}`);
    process.exit(1);
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    const entry = data[key];
    if (!isPlainObject(entry)) {
      console.error(`${ARTIFACT} key "${key}" must be a plain object.`);
      process.exit(1);
    }

    const subKeys = Object.keys(entry);
    if (subKeys.length !== 1 || subKeys[0] !== 'relativePath') {
      console.error(
        `${ARTIFACT} key "${key}" must be an object with exactly one property: relativePath.`
      );
      process.exit(1);
    }

    const expected = EXPECTED_RELATIVE_PATH[key];
    const got = entry.relativePath;

    if (got !== expected) {
      console.error(
        `${ARTIFACT} key "${key}" relativePath must be ${JSON.stringify(expected)}; got ${JSON.stringify(got)}.`
      );
      process.exit(1);
    }
  }

  console.log(`OK: ${ARTIFACT} — loader shape valid.`);
}

main();
