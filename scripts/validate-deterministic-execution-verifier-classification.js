'use strict';

/**
 * Validates artifacts/media-listing-deterministic-execution-verifier-classification-contract.json
 * against repo-root verify:media-listing:deterministic-execution* commands in package.json.
 *
 * - directVerifierCommands ∪ metaCommands = full deterministic-execution verify surface (disjoint).
 * - excludedFromInventoryCommands ⊆ (direct ∪ meta); overlaps direct/meta are allowed (audit meta, audit helpers).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const CONTRACT_REL = 'artifacts/media-listing-deterministic-execution-verifier-classification-contract.json';
const PREFIX = 'verify:media-listing:deterministic-execution';

const EXPECTED_TOP_KEYS = ['schemaVersion', 'directVerifierCommands', 'excludedFromInventoryCommands', 'metaCommands'];

const DIRECT_BODY = /^node scripts\/[^ ]+\.js$/;
const META_NO_NODE = /\bnode\b/;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function isSortedStrict(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1] >= arr[i]) return false;
  }
  return true;
}

function readJson(label, filePath, requireLf) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    fail(`${label}: cannot read ${filePath}`);
  }
  if (requireLf && raw.includes('\r\n')) {
    fail(`${label}: must use LF newlines only`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${label}: invalid JSON`);
  }
}

function assertKeyOrder(obj, expected, ctx) {
  const actual = Object.keys(obj);
  if (actual.length !== expected.length) {
    fail(`${ctx}: expected keys ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      fail(`${ctx}: key order drift at ${i}: expected ${expected[i]}, got ${actual[i]}`);
    }
  }
}

function main() {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const contractPath = path.join(REPO_ROOT, ...CONTRACT_REL.split('/'));

  const pkg = readJson('package.json', pkgPath, false);
  const contract = readJson('classification contract', contractPath, true);

  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    fail('package.json must define scripts');
  }

  assertKeyOrder(contract, EXPECTED_TOP_KEYS, 'contract top-level');

  if (contract.schemaVersion !== 1) {
    fail('contract.schemaVersion must be 1');
  }

  const direct = contract.directVerifierCommands;
  const meta = contract.metaCommands;
  const excluded = contract.excludedFromInventoryCommands;

  if (!Array.isArray(direct) || !Array.isArray(meta) || !Array.isArray(excluded)) {
    fail('contract category fields must be arrays');
  }

  const discovered = Object.keys(pkg.scripts)
    .filter((k) => k.startsWith(PREFIX))
    .sort();

  const directSet = new Set(direct);
  const metaSet = new Set(meta);
  const excludedSet = new Set(excluded);

  if (direct.length !== directSet.size) fail('directVerifierCommands has duplicates');
  if (meta.length !== metaSet.size) fail('metaCommands has duplicates');
  if (excluded.length !== excludedSet.size) fail('excludedFromInventoryCommands has duplicates');

  if (!isSortedStrict(direct)) fail('directVerifierCommands must be sorted lexicographically (strict)');
  if (!isSortedStrict(meta)) fail('metaCommands must be sorted lexicographically (strict)');
  if (!isSortedStrict(excluded)) fail('excludedFromInventoryCommands must be sorted lexicographically (strict)');

  for (const x of direct) {
    if (metaSet.has(x)) {
      fail(`command ${JSON.stringify(x)} appears in both directVerifierCommands and metaCommands`);
    }
  }

  const union = new Set([...direct, ...meta]);
  if (union.size !== direct.length + meta.length) {
    fail('INTERNAL: direct and meta should be disjoint');
  }

  const discoveredSet = new Set(discovered);
  if (discovered.length !== discoveredSet.size) fail('duplicate script keys in package.json');

  if (union.size !== discoveredSet.size) {
    const missing = [...discoveredSet].filter((k) => !union.has(k));
    const extra = [...union].filter((k) => !discoveredSet.has(k));
    const parts = [];
    if (missing.length) parts.push(`not classified (add to contract): ${missing.join(', ')}`);
    if (extra.length) parts.push(`unknown in package.json (remove from contract): ${extra.join(', ')}`);
    fail(`Classification contract does not match package.json verify surface.\n${parts.join('\n')}`);
  }

  for (const name of excluded) {
    if (!union.has(name)) {
      fail(`excludedFromInventoryCommands entry not in direct∪meta: ${JSON.stringify(name)}`);
    }
  }

  for (const name of direct) {
    const body = pkg.scripts[name];
    if (typeof body !== 'string') fail(`direct command ${name} must have string body`);
    const t = body.trim();
    if (!DIRECT_BODY.test(t)) {
      fail(`direct command ${name} must be exactly node scripts/<file>.js; got ${JSON.stringify(t)}`);
    }
    if (t.includes('&&')) fail(`direct command ${name} must not use &&`);
  }

  for (const name of meta) {
    const body = pkg.scripts[name];
    if (typeof body !== 'string') fail(`meta command ${name} must have string body`);
    if (META_NO_NODE.test(body.trim())) {
      fail(`meta command ${name} must not invoke node directly`);
    }
  }

  console.log('OK: deterministic execution verifier classification contract matches package.json surface and semantics.');
}

main();
