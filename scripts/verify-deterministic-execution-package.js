'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const CONTRACT_FILE = 'media-listing-deterministic-execution-contract.json';
const PACKAGE_FILE = 'media-listing-deterministic-execution-package.json';

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

function buildExpectedPackagePayload() {
  const packagePayload = {};
  for (const key of REQUIRED_TOP_LEVEL) {
    packagePayload[key] = { relativePath: EXPECTED_RELATIVE_PATH[key] };
  }
  return packagePayload;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const contractPath = path.join(repoRoot, 'artifacts', CONTRACT_FILE);
  const packagePath = path.join(repoRoot, 'artifacts', PACKAGE_FILE);

  const contract = readJsonFile('deterministic execution contract', contractPath);
  const pkg = readJsonFile('deterministic execution package', packagePath);
  const expected = buildExpectedPackagePayload();

  if (!isPlainObject(contract)) {
    console.error(`${CONTRACT_FILE} must be a plain JSON object at the top level.`);
    process.exit(1);
  }

  if (!isPlainObject(pkg)) {
    console.error(`${PACKAGE_FILE} must be a plain JSON object at the top level.`);
    process.exit(1);
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    if (!Object.prototype.hasOwnProperty.call(contract, key)) {
      console.error(`${CONTRACT_FILE} is missing top-level key: ${key}`);
      process.exit(1);
    }
    if (!Object.prototype.hasOwnProperty.call(pkg, key)) {
      console.error(`${PACKAGE_FILE} is missing top-level key: ${key}`);
      process.exit(1);
    }
  }

  const extraContractKeys = Object.keys(contract).filter((k) => !REQUIRED_TOP_LEVEL.includes(k));
  if (extraContractKeys.length > 0) {
    console.error(`${CONTRACT_FILE} has unexpected top-level key(s): ${extraContractKeys.join(', ')}`);
    process.exit(1);
  }

  const extraPackageKeys = Object.keys(pkg).filter((k) => !REQUIRED_TOP_LEVEL.includes(k));
  if (extraPackageKeys.length > 0) {
    console.error(`${PACKAGE_FILE} has unexpected top-level key(s): ${extraPackageKeys.join(', ')}`);
    process.exit(1);
  }

  if (!util.isDeepStrictEqual(contract, pkg)) {
    console.error('Deterministic execution contract does not match checked-in package artifact.');
    process.exit(1);
  }

  if (!util.isDeepStrictEqual(pkg, expected)) {
    console.error('Deterministic execution package does not match export script expected payload.');
    process.exit(1);
  }

  for (const key of REQUIRED_TOP_LEVEL) {
    const relPath = pkg[key].relativePath;
    const abs = path.join(repoRoot, ...relPath.split('/'));
    readJsonFile(`referenced artifact for ${key}`, abs);
  }

  console.log(`OK: ${PACKAGE_FILE} matches ${CONTRACT_FILE} and export script output; referenced artifacts exist.`);
}

main();
