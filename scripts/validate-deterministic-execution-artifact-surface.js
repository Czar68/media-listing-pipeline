'use strict';

const fs = require('fs');
const path = require('path');

const INVENTORY_REL = 'artifacts/media-listing-deterministic-execution-inventory-contract.json';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readJsonFile(label, filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      fail(`${label} not found: ${filePath}`);
    }
    fail(`Cannot read ${label} at ${filePath}: ${err && err.message ? err.message : err}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail(`Invalid JSON in ${label}: ${err && err.message ? err.message : err}`);
  }
  return data;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const inventoryPath = path.join(repoRoot, ...INVENTORY_REL.split('/'));
  const inv = readJsonFile('deterministic execution inventory contract', inventoryPath);

  if (!Array.isArray(inv.layers)) {
    fail('inventory contract: layers must be an array.');
  }

  // Collect all canonical checkedInPaths from all inventory layers.
  const canonicalPaths = [];
  const seenPaths = new Set();

  for (const layer of inv.layers) {
    if (!Array.isArray(layer.checkedInPaths)) {
      fail(`inventory contract layer ${JSON.stringify(layer.id)}: checkedInPaths must be an array.`);
    }
    for (const rel of layer.checkedInPaths) {
      if (typeof rel !== 'string' || rel.length === 0) {
        fail(`inventory contract layer ${JSON.stringify(layer.id)}: checkedInPaths entries must be non-empty strings.`);
      }
      if (seenPaths.has(rel)) {
        fail(`Duplicate checkedInPath across inventory layers: ${rel}`);
      }
      seenPaths.add(rel);
      canonicalPaths.push(rel);
    }
  }

  if (canonicalPaths.length === 0) {
    fail('inventory contract lists no checkedInPaths; cannot validate artifact surface.');
  }

  // Verify every canonical path exists on disk.
  const missing = [];
  for (const rel of canonicalPaths) {
    const abs = path.join(repoRoot, ...rel.split('/'));
    try {
      fs.accessSync(abs, fs.constants.R_OK);
    } catch {
      missing.push(rel);
    }
  }

  if (missing.length > 0) {
    fail(
      `Deterministic execution artifact surface: canonical paths listed in inventory are missing on disk:\n` +
        missing.map((p) => `  ${p}`).join('\n')
    );
  }

  // Verify all canonical paths are uniquely named at the basename level (no basename collisions).
  const basenameCounts = new Map();
  for (const rel of canonicalPaths) {
    const base = path.basename(rel);
    basenameCounts.set(base, (basenameCounts.get(base) || 0) + 1);
  }
  const collisions = [];
  for (const [base, count] of basenameCounts.entries()) {
    if (count > 1) {
      collisions.push(`${base} (appears ${count} times)`);
    }
  }
  if (collisions.length > 0) {
    fail(
      `Deterministic execution artifact surface: basename collisions across inventory layers:\n` +
        collisions.map((c) => `  ${c}`).join('\n')
    );
  }

  // Active validation: check physical artifacts/ folder for any stray/stale files in the governed namespaces.
  const artifactsDir = path.join(repoRoot, 'artifacts');
  const actualFiles = fs.readdirSync(artifactsDir).filter((f) => f.endsWith('.json'));

  const canonicalBasenames = new Set(canonicalPaths.map((p) => path.basename(p)));
  
  // The deterministic execution surface exclusively governs these artifact domains:
  const GOVERNED_DOMAINS = [
    'media-listing-deterministic-execution',
    'media-listing-execution-full-snapshot',
    // Catch common typo/drift variants explicitly
    'media-listing-full-execution-snapshot'
  ];

  const strays = [];
  for (const f of actualFiles) {
    const isGoverned = GOVERNED_DOMAINS.some((domain) => f.startsWith(domain));
    if (isGoverned && !canonicalBasenames.has(f)) {
      strays.push(f);
    }
  }

  if (strays.length > 0) {
    fail(
      `Deterministic execution artifact surface: stale or untracked artifacts present in governed namespace that are not in the inventory:\n` +
        strays.map((s) => `  ${s}`).join('\n')
    );
  }

  console.log(
    `OK: deterministic execution artifact surface verified — ${canonicalPaths.length} canonical paths present, uniquely named, and no stale overlap (derived from inventory contract).`
  );
}

main();
