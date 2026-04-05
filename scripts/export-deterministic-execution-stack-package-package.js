'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_FILE = 'media-listing-deterministic-execution-stack-package-contract.json';
const PACKAGE_FILE = 'media-listing-deterministic-execution-stack-package-package.json';

const REQUIRED_TOP_LEVEL = [
  'executionFixturePackage',
  'executionPlan',
  'executionRun',
  'executionReport',
  'executionBundle',
  'executionBundlePackage',
  'executionFullSnapshotContract',
  'executionFullSnapshotPackage',
];

const EXPECTED_RELATIVE_PATH = {
  executionFixturePackage: null,
  executionPlan: 'artifacts/media-listing-execution-plan.json',
  executionRun: 'artifacts/media-listing-execution-run.json',
  executionReport: 'artifacts/media-listing-execution-report.json',
  executionBundle: 'artifacts/media-listing-execution-bundle.json',
  executionBundlePackage: null,
  executionFullSnapshotContract: 'artifacts/media-listing-execution-full-snapshot-contract.json',
  executionFullSnapshotPackage: 'artifacts/media-listing-execution-full-snapshot-package.json',
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const repoRoot = path.join(__dirname, '..');
const contractPath = path.join(repoRoot, 'artifacts', CONTRACT_FILE);

let raw;
try {
  raw = fs.readFileSync(contractPath, 'utf8');
} catch (err) {
  if (err && err.code === 'ENOENT') {
    console.error(`Stack package contract not found (expected at script-relative path): ${contractPath}`);
  } else {
    console.error(`Cannot read stack package contract at ${contractPath}: ${err && err.message ? err.message : err}`);
  }
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error(`Invalid JSON in ${CONTRACT_FILE}: ${err && err.message ? err.message : err}`);
  process.exit(1);
}

if (!isPlainObject(parsed)) {
  console.error(`${CONTRACT_FILE} must be a plain JSON object at the top level.`);
  process.exit(1);
}

const packagePayload = {};

for (const key of REQUIRED_TOP_LEVEL) {
  if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
    console.error(`${CONTRACT_FILE} is missing top-level key: ${key}`);
    process.exit(1);
  }

  const entry = parsed[key];
  if (!isPlainObject(entry)) {
    console.error(`${CONTRACT_FILE} key "${key}" must be a plain object.`);
    process.exit(1);
  }

  const subKeys = Object.keys(entry);
  if (subKeys.length !== 1 || subKeys[0] !== 'relativePath') {
    console.error(`${CONTRACT_FILE} key "${key}" must be an object with exactly one property: relativePath.`);
    process.exit(1);
  }

  const expected = EXPECTED_RELATIVE_PATH[key];
  const got = entry.relativePath;

  if (expected === null) {
    if (got !== null) {
      console.error(
        `${CONTRACT_FILE} key "${key}" relativePath must be null; got ${JSON.stringify(got)}.`
      );
      process.exit(1);
    }
  } else if (got !== expected) {
    console.error(
      `${CONTRACT_FILE} key "${key}" relativePath must be ${JSON.stringify(expected)}; got ${JSON.stringify(got)}.`
    );
    process.exit(1);
  }

  packagePayload[key] = { relativePath: expected === null ? null : expected };
}

const extraKeys = Object.keys(parsed).filter((k) => !REQUIRED_TOP_LEVEL.includes(k));
if (extraKeys.length > 0) {
  console.error(`${CONTRACT_FILE} has unexpected top-level key(s): ${extraKeys.join(', ')}`);
  process.exit(1);
}

const outDir = path.join(repoRoot, 'artifacts');
const outPath = path.join(outDir, PACKAGE_FILE);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(packagePayload, null, 2)}\n`, 'utf8');

console.log(`OK: wrote artifacts/${PACKAGE_FILE}`);
