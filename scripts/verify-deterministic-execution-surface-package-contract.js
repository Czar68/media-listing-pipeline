'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

const PACKAGE_FILE = 'media-listing-deterministic-execution-surface-package.json';
const CONTRACT_FILE = 'media-listing-deterministic-execution-surface-package-contract.json';

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
  const contractPath = path.join(repoRoot, 'artifacts', CONTRACT_FILE);

  const pkg = readJsonFile('deterministic execution surface package', packagePath);
  const contract = readJsonFile('deterministic execution surface package contract', contractPath);

  if (!util.isDeepStrictEqual(pkg, contract)) {
    console.error('Surface package artifact does not match checked-in contract.');
    process.exit(1);
  }

  console.log(`OK: ${PACKAGE_FILE} matches ${CONTRACT_FILE}.`);
}

main();
