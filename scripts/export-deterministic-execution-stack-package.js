'use strict';

const fs = require('fs');
const path = require('path');

const OUT_FILE = 'media-listing-deterministic-execution-stack-package.json';

/** Relative to repo root; forward slashes only (no absolute paths). */
const REQUIRED_ARTIFACTS = [
  ['executionPlan', 'artifacts/media-listing-execution-plan.json'],
  ['executionRun', 'artifacts/media-listing-execution-run.json'],
  ['executionReport', 'artifacts/media-listing-execution-report.json'],
  ['executionBundle', 'artifacts/media-listing-execution-bundle.json'],
  ['executionFullSnapshotContract', 'artifacts/media-listing-execution-full-snapshot-contract.json'],
  ['executionFullSnapshotPackage', 'artifacts/media-listing-execution-full-snapshot-package.json'],
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

const pkg = {
  executionFixturePackage: { relativePath: null },
  executionPlan: { relativePath: 'artifacts/media-listing-execution-plan.json' },
  executionRun: { relativePath: 'artifacts/media-listing-execution-run.json' },
  executionReport: { relativePath: 'artifacts/media-listing-execution-report.json' },
  executionBundle: { relativePath: 'artifacts/media-listing-execution-bundle.json' },
  executionBundlePackage: { relativePath: null },
  executionFullSnapshotContract: { relativePath: 'artifacts/media-listing-execution-full-snapshot-contract.json' },
  executionFullSnapshotPackage: { relativePath: 'artifacts/media-listing-execution-full-snapshot-package.json' },
};

for (const [, relPath] of REQUIRED_ARTIFACTS) {
  ensureJsonArtifact(relPath);
}

const outDir = path.join(repoRoot, 'artifacts');
const outPath = path.join(outDir, OUT_FILE);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(`OK: wrote artifacts/${OUT_FILE}`);
