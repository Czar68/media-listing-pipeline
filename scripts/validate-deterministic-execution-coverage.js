'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const INVENTORY_REL = 'artifacts/media-listing-deterministic-execution-inventory-contract.json';

/**
 * Verifier scripts that are invoked only as chained steps from
 * verify:media-listing:deterministic-execution-surface / stack and are intentionally
 * not listed row-by-row in the inventory contract (inventory lists the aggregate steps).
 */
const TRANSITIVE_DETERMINISTIC_EXECUTION_VERIFIERS = new Set([
  'verify:media-listing:deterministic-execution-stack',
  'verify:media-listing:deterministic-execution-stack-package-contract',
  'verify:media-listing:deterministic-execution-stack-package-loader',
  'verify:media-listing:deterministic-execution-stack-package-package',
  'verify:media-listing:deterministic-execution-surface-package-contract',
  'verify:media-listing:deterministic-execution-surface-package-loader',
  'verify:media-listing:deterministic-execution-surface-package-package',
]);

/** Not part of the aggregate gate; omitted from inventory by design (meta repo-root audit commands). */
const EXCLUDED_FROM_INVENTORY_VERIFIER_LIST = new Set([
  'verify:media-listing:deterministic-execution-coverage',
  'verify:media-listing:deterministic-execution-audit',
  'verify:media-listing:deterministic-execution-script-wiring',
  'verify:media-listing:deterministic-execution-command-policy',
  'verify:media-listing:deterministic-execution-command-topology',
]);

const GIT_LS_FILES_GLOBS = [
  'artifacts/media-listing-deterministic-execution*.json',
  'artifacts/media-listing-execution-full-snapshot*.json',
];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function gitLsFilesTracked(repoRoot, pattern) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z', '--', pattern], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    fail(`git ls-files failed for pattern ${JSON.stringify(pattern)}: ${r.stderr || r.stdout || 'unknown error'}`);
  }
  const out = (r.stdout || '').split('\0').filter(Boolean);
  return out;
}

function collectInventoryPathsAndCommands(inv) {
  const paths = [];
  const commands = [];
  if (!Array.isArray(inv.layers)) {
    fail('inventory contract: layers must be an array.');
  }
  for (const layer of inv.layers) {
    if (!isPlainObject(layer)) {
      fail('inventory contract: each layer must be an object.');
    }
    if (!Array.isArray(layer.checkedInPaths)) {
      fail(`inventory contract: layer ${JSON.stringify(layer.id)} missing checkedInPaths array.`);
    }
    for (const p of layer.checkedInPaths) {
      paths.push(p);
    }
    if (!Array.isArray(layer.verifiers)) {
      fail(`inventory contract: layer ${JSON.stringify(layer.id)} missing verifiers array.`);
    }
    for (const v of layer.verifiers) {
      if (!isPlainObject(v) || typeof v.command !== 'string') {
        fail('inventory contract: each verifier must be an object with command string.');
      }
      commands.push(v.command);
    }
  }
  return { paths, commands };
}

function sortedUnique(arr) {
  const u = [...new Set(arr)];
  u.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return u;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const inventoryPath = path.join(repoRoot, ...INVENTORY_REL.split('/'));
  const inv = readJsonFile('deterministic execution inventory contract', inventoryPath);

  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = readJsonFile('package.json', pkgPath);
  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    fail('package.json must define a scripts object.');
  }

  const { paths: invPaths, commands: invCommands } = collectInventoryPathsAndCommands(inv);

  const pathSetFromInventory = new Set(invPaths);
  const commandSetFromInventory = new Set(invCommands);

  if (invPaths.length !== pathSetFromInventory.size) {
    fail('inventory contract lists duplicate checkedInPaths entries.');
  }
  if (invCommands.length !== commandSetFromInventory.size) {
    fail('inventory contract lists duplicate verifier command entries.');
  }

  for (const rel of invPaths) {
    const abs = path.join(repoRoot, ...rel.split('/'));
    try {
      fs.accessSync(abs, fs.constants.R_OK);
    } catch {
      fail(`inventory lists path that is missing on disk: ${rel}`);
    }
  }

  let trackedArtifactPaths = [];
  for (const g of GIT_LS_FILES_GLOBS) {
    trackedArtifactPaths = trackedArtifactPaths.concat(gitLsFilesTracked(repoRoot, g));
  }
  trackedArtifactPaths = sortedUnique(trackedArtifactPaths);

  for (const rel of trackedArtifactPaths) {
    if (!pathSetFromInventory.has(rel)) {
      fail(
        `tracked deterministic execution artifact exists in repo but is absent from inventory checkedInPaths: ${rel}`
      );
    }
  }

  const discoveredVerifierNames = Object.keys(pkg.scripts).filter(
    (k) =>
      k.startsWith('verify:media-listing:deterministic-execution') ||
      k === 'verify:media-listing:execution-full-snapshot-contract' ||
      k === 'verify:media-listing:execution-full-snapshot-package'
  );

  const discoveredSet = new Set(discoveredVerifierNames);
  for (const name of discoveredVerifierNames) {
    if (typeof pkg.scripts[name] !== 'string' || pkg.scripts[name].length === 0) {
      fail(`package.json script ${JSON.stringify(name)} must be a non-empty string.`);
    }
  }

  const requiredInInventory = new Set();
  for (const name of discoveredVerifierNames) {
    if (EXCLUDED_FROM_INVENTORY_VERIFIER_LIST.has(name)) continue;
    if (TRANSITIVE_DETERMINISTIC_EXECUTION_VERIFIERS.has(name)) continue;
    requiredInInventory.add(name);
  }

  if (!setsEqual(requiredInInventory, commandSetFromInventory)) {
    const missing = [...requiredInInventory].filter((c) => !commandSetFromInventory.has(c));
    const extra = [...commandSetFromInventory].filter((c) => !requiredInInventory.has(c));
    const parts = [];
    if (missing.length) parts.push(`missing from inventory: ${missing.join(', ')}`);
    if (extra.length) parts.push(`extra in inventory (not required by coverage rules): ${extra.join(', ')}`);
    fail(`inventory verifier command set does not match repo-root deterministic execution coverage.\n${parts.join('\n')}`);
  }

  for (const t of TRANSITIVE_DETERMINISTIC_EXECUTION_VERIFIERS) {
    if (!discoveredSet.has(t)) {
      fail(
        `TRANSITIVE_DETERMINISTIC_EXECUTION_VERIFIERS lists ${JSON.stringify(t)} but that script is missing from package.json`
      );
    }
  }

  console.log(
    'OK: deterministic execution inventory coverage matches tracked artifacts and verifier scripts (bidirectional).'
  );
}

main();
