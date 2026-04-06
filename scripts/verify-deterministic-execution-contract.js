'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

function buildExpectedContractPayload() {
  const contractPayload = {};
  for (const key of REQUIRED_TOP_LEVEL) {
    contractPayload[key] = { relativePath: EXPECTED_RELATIVE_PATH[key] };
  }
  return contractPayload;
}

function ensureReferencedArtifactsExist() {
  const repoRoot = path.join(__dirname, '..');
  for (const key of REQUIRED_TOP_LEVEL) {
    const relPath = EXPECTED_RELATIVE_PATH[key];
    const abs = path.join(repoRoot, ...relPath.split('/'));
    readJsonFile(`referenced artifact for ${key}`, abs);
  }
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const contractPath = path.join(repoRoot, 'artifacts', CONTRACT_FILE);

  ensureReferencedArtifactsExist();

  const contract = readJsonFile('deterministic execution contract', contractPath);
  const expected = buildExpectedContractPayload();

  if (!isPlainObject(contract)) {
    console.error(`${CONTRACT_FILE} must be a plain JSON object at the top level.`);
    process.exit(1);
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!Object.prototype.hasOwnProperty.call(contract, key)) {
      console.error(`${CONTRACT_FILE} is missing top-level key: ${key}`);
      process.exit(1);
    }

    const entry = contract[key];
    if (!isPlainObject(entry)) {
      console.error(`${CONTRACT_FILE} key "${key}" must be a plain object.`);
      process.exit(1);
    }

    const subKeys = Object.keys(entry);
    if (subKeys.length !== 1 || subKeys[0] !== 'relativePath') {
      console.error(`${CONTRACT_FILE} key "${key}" must be an object with exactly one property: relativePath.`);
      process.exit(1);
    }

    const expPath = EXPECTED_RELATIVE_PATH[key];
    if (entry.relativePath !== expPath) {
      console.error(
        `${CONTRACT_FILE} key "${key}" relativePath must be ${JSON.stringify(expPath)}; got ${JSON.stringify(entry.relativePath)}.`
      );
      process.exit(1);
    }
  }

  const extraKeys = Object.keys(contract).filter((k) => !REQUIRED_TOP_LEVEL.includes(k));
  if (extraKeys.length > 0) {
    console.error(`${CONTRACT_FILE} has unexpected top-level key(s): ${extraKeys.join(', ')}`);
    process.exit(1);
  }

  if (!util.isDeepStrictEqual(contract, expected)) {
    console.error('Deterministic execution contract does not match export script output (expected payload).');
    process.exit(1);
  }

  console.log(`OK: ${CONTRACT_FILE} matches export script output and referenced artifacts exist.`);
}

main();
