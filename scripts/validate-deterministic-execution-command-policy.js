'use strict';

/**
 * Repo-root deterministic execution npm command policy (package.json only).
 *
 * Direct verifier commands: exactly one invocation, `node scripts/<file>.js` — no args, no &&.
 * Meta commands: chain only `npm run <script>` segments with `&&` — no raw `node`, no shell extras.
 *
 * Distinctions align with validate-deterministic-execution-script-wiring.js (direct vs meta sets).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PREFIX = 'verify:media-listing:deterministic-execution';

/** Chained aggregate / audit commands (npm-only segments). */
const META_COMMANDS = new Set([
  'verify:media-listing:deterministic-execution',
  'verify:media-listing:deterministic-execution-audit',
  'verify:media-listing:deterministic-execution-stack',
  'verify:media-listing:deterministic-execution-surface',
  'verify:media-listing:deterministic-execution-surface-package',
]);

/** command name -> exact script body (must match package.json string exactly). */
const DIRECT_EXACT_BODY = new Map([
  ['verify:media-listing:deterministic-execution-inventory', 'node scripts/validate-deterministic-execution-inventory.js'],
  ['verify:media-listing:deterministic-execution-coverage', 'node scripts/validate-deterministic-execution-coverage.js'],
  ['verify:media-listing:deterministic-execution-script-wiring', 'node scripts/validate-deterministic-execution-script-wiring.js'],
  ['verify:media-listing:deterministic-execution-command-policy', 'node scripts/validate-deterministic-execution-command-policy.js'],
  ['verify:media-listing:deterministic-execution-command-topology', 'node scripts/validate-deterministic-execution-command-topology.js'],
  ['verify:media-listing:deterministic-execution-contract', 'node scripts/verify-deterministic-execution-contract.js'],
  ['verify:media-listing:deterministic-execution-package', 'node scripts/verify-deterministic-execution-package.js'],
  ['verify:media-listing:deterministic-execution-stack-package-loader', 'node scripts/verify-deterministic-execution-stack-package-loader.js'],
  ['verify:media-listing:deterministic-execution-stack-package-contract', 'node scripts/verify-deterministic-execution-stack-package-contract.js'],
  ['verify:media-listing:deterministic-execution-stack-package-package', 'node scripts/verify-deterministic-execution-stack-package-package.js'],
  ['verify:media-listing:deterministic-execution-surface-package-contract', 'node scripts/verify-deterministic-execution-surface-package-contract.js'],
  ['verify:media-listing:deterministic-execution-surface-package-package', 'node scripts/verify-deterministic-execution-surface-package-package.js'],
  ['verify:media-listing:deterministic-execution-surface-package-loader', 'node scripts/verify-deterministic-execution-surface-package-loader.js'],
]);

const UNSUPPORTED_SHELL = /[|<>;`$()]/;
const SEGMENT_NPM_RUN = /^npm run \S+$/;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readPackageJson() {
  const p = path.join(REPO_ROOT, 'package.json');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    fail(`Cannot read package.json: ${e && e.message ? e.message : e}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON in package.json: ${e && e.message ? e.message : e}`);
  }
}

function validateMetaCommand(name, body) {
  if (typeof body !== 'string') {
    fail(`Policy: ${name} body must be a string.`);
  }
  const b = body.trim();
  if (b.includes('\n') || b.includes('\r')) {
    fail(`Policy: ${name} meta command must not contain line breaks.`);
  }
  if (UNSUPPORTED_SHELL.test(b)) {
    fail(`Policy: ${name} meta command contains unsupported shell construct.`);
  }
  if (/\bnode\b/.test(b)) {
    fail(`Policy: ${name} meta command must not invoke node; use npm run to compose.`);
  }
  if (b.includes('&') && !b.includes('&&')) {
    fail(`Policy: ${name} meta command uses bare & (only && is allowed).`);
  }
  const parts = b.split('&&').map((s) => s.trim());
  if (parts.length === 0 || parts.some((p) => p.length === 0)) {
    fail(`Policy: ${name} meta command has an empty && segment.`);
  }
  for (const p of parts) {
    if (!SEGMENT_NPM_RUN.test(p)) {
      fail(`Policy: ${name} meta segment must be exactly "npm run <one-token-script>": ${JSON.stringify(p)}`);
    }
  }
}

function main() {
  const pkg = readPackageJson();
  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    fail('package.json must define scripts.');
  }

  const discovered = Object.keys(pkg.scripts).filter((k) => k.startsWith(PREFIX));
  const directKeys = new Set(DIRECT_EXACT_BODY.keys());
  const metaKeys = new Set(META_COMMANDS);

  for (const k of directKeys) {
    if (metaKeys.has(k)) {
      fail(`INTERNAL: ${JSON.stringify(k)} is listed as both direct and meta.`);
    }
  }

  const expected = new Set([...directKeys, ...metaKeys]);
  if (directKeys.size !== DIRECT_EXACT_BODY.size) {
    fail('INTERNAL: duplicate keys in DIRECT_EXACT_BODY.');
  }

  const discoveredSet = new Set(discovered);
  if (discovered.length !== discoveredSet.size) {
    fail('package.json lists duplicate script names (should be impossible).');
  }

  if (discovered.length !== expected.size) {
    const missing = [...expected].filter((k) => !discoveredSet.has(k));
    const extra = discovered.filter((k) => !expected.has(k));
    const parts = [];
    if (missing.length) parts.push(`missing from package.json: ${missing.join(', ')}`);
    if (extra.length) parts.push(`unexpected commands (update policy map): ${extra.join(', ')}`);
    fail(`Deterministic execution command policy set mismatch.\n${parts.join('\n')}`);
  }

  for (const name of discovered) {
    const body = pkg.scripts[name];
    if (META_COMMANDS.has(name)) {
      validateMetaCommand(name, body);
      continue;
    }
    if (!DIRECT_EXACT_BODY.has(name)) {
      fail(`Unexpected command ${JSON.stringify(name)} — not in DIRECT_EXACT_BODY or META_COMMANDS.`);
    }
    const expectedBody = DIRECT_EXACT_BODY.get(name);
    if (body !== expectedBody) {
      fail(
        `Policy: ${name} must be exactly ${JSON.stringify(expectedBody)}; got ${JSON.stringify(body)}`
      );
    }
    if (body.includes('&&')) {
      fail(`Policy: ${name} is direct and must not use &&.`);
    }
    if (!/^node scripts\/[^ ]+\.js$/.test(body)) {
      fail(`Policy: ${name} direct body must match node scripts/<file>.js (no args).`);
    }
  }

  console.log('OK: deterministic execution npm command policy (direct vs meta) satisfied for package.json.');
}

main();
