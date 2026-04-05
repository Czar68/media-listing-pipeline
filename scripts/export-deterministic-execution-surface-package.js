'use strict';

const fs = require('fs');
const path = require('path');

const OUT_FILE = 'media-listing-deterministic-execution-surface-package.json';

/** Stable key order; values are repo-relative paths (forward slashes). */
const SURFACE_ARTIFACTS = [
  ['executionFullSnapshotContract', 'artifacts/media-listing-execution-full-snapshot-contract.json'],
  ['executionFullSnapshotPackage', 'artifacts/media-listing-execution-full-snapshot-package.json'],
  ['executionStackPackageContract', 'artifacts/media-listing-deterministic-execution-stack-package-contract.json'],
  ['executionStackPackagePackage', 'artifacts/media-listing-deterministic-execution-stack-package-package.json'],
];

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

const packagePayload = {};

for (const [key, relPath] of SURFACE_ARTIFACTS) {
  ensureJsonArtifact(relPath);
  packagePayload[key] = { relativePath: relPath };
}

const outDir = path.join(repoRoot, 'artifacts');
const outPath = path.join(outDir, OUT_FILE);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(packagePayload, null, 2)}\n`, 'utf8');

console.log(`OK: wrote artifacts/${OUT_FILE}`);
