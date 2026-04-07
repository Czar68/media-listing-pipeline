'use strict';

/**
 * Verifies allowlisted deterministic-execution *meta* npm commands form the expected
 * `&&` chain topology (ordered children, no duplicates).
 * package.json only; no recursive expansion beyond these five parents.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const UNSUPPORTED_SHELL = /[|<>;`$()]/;

/**
 * Parent meta command -> ordered list of child script names (as in `npm run <name>`).
 * Keys must be unique; each child list must have no duplicates.
 */
const EXPECTED_META_TOPOLOGY = new Map([
  [
    'verify:media-listing:deterministic-execution-audit',
    [
      'verify:media-listing:deterministic-execution-inventory',
      'verify:media-listing:deterministic-execution-coverage',
      'verify:media-listing:deterministic-execution',
    ],
  ],
  [
    'verify:media-listing:deterministic-execution',
    [
      'verify:media-listing:deterministic-execution-contract',
      'verify:media-listing:deterministic-execution-package',
      'verify:media-listing:deterministic-execution-surface',
      'verify:media-listing:deterministic-execution-surface-package',
    ],
  ],
  [
    'verify:media-listing:deterministic-execution-stack',
    [
      'verify:media-listing:execution-fixture-package',
      'verify:media-listing:execution-plan',
      'verify:media-listing:execution-run',
      'verify:media-listing:execution-report',
      'verify:media-listing:execution-bundle',
      'verify:media-listing:execution-bundle-package',
      'verify:media-listing:execution-full-snapshot',
    ],
  ],
  [
    'verify:media-listing:deterministic-execution-surface',
    [
      'verify:media-listing:deterministic-execution-stack',
      'export:media-listing:deterministic-execution-stack-package',
      'verify:media-listing:deterministic-execution-stack-package-loader',
      'export:media-listing:deterministic-execution-stack-package-contract',
      'verify:media-listing:deterministic-execution-stack-package-contract',
      'export:media-listing:deterministic-execution-stack-package-package',
      'verify:media-listing:deterministic-execution-stack-package-package',
    ],
  ],
  [
    'verify:media-listing:deterministic-execution-surface-package',
    [
      'export:media-listing:deterministic-execution-surface-package',
      'verify:media-listing:deterministic-execution-surface-package-loader',
      'export:media-listing:deterministic-execution-surface-package-contract',
      'verify:media-listing:deterministic-execution-surface-package-contract',
      'export:media-listing:deterministic-execution-surface-package-package',
      'verify:media-listing:deterministic-execution-surface-package-package',
    ],
  ],
]);

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

function parseMetaChain(parentName, body) {
  if (typeof body !== 'string') {
    fail(`Topology: ${parentName} body must be a string.`);
  }
  const b = body.trim();
  if (b.includes('\n') || b.includes('\r')) {
    fail(`Topology: ${parentName} must not contain line breaks.`);
  }
  if (UNSUPPORTED_SHELL.test(b)) {
    fail(`Topology: ${parentName} contains unsupported shell construct.`);
  }
  if (/\bnode\b/.test(b)) {
    fail(`Topology: ${parentName} must not invoke node; use npm run only.`);
  }
  if (b.includes('&') && !b.includes('&&')) {
    fail(`Topology: ${parentName} uses bare & (only && is allowed).`);
  }
  const parts = b.split('&&').map((s) => s.trim());
  if (parts.length === 0 || parts.some((p) => !p.length)) {
    fail(`Topology: ${parentName} has an empty && segment.`);
  }
  const children = [];
  const re = /^npm run (\S+)$/;
  for (const p of parts) {
    const m = p.match(re);
    if (!m) {
      fail(`Topology: ${parentName} segment must be exactly "npm run <one-token-script>": ${JSON.stringify(p)}`);
    }
    children.push(m[1]);
  }
  const seen = new Set();
  for (const c of children) {
    if (seen.has(c)) {
      fail(`Topology: ${parentName} lists duplicate child ${JSON.stringify(c)}`);
    }
    seen.add(c);
  }
  return children;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function main() {
  if (EXPECTED_META_TOPOLOGY.size !== 5) {
    fail('INTERNAL: topology map must cover exactly five meta commands.');
  }

  const pkg = readPackageJson();
  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    fail('package.json must define scripts.');
  }

  for (const [parent, expectedChildren] of EXPECTED_META_TOPOLOGY) {
    if (!Object.prototype.hasOwnProperty.call(pkg.scripts, parent)) {
      fail(`Topology: missing covered meta command ${JSON.stringify(parent)} in package.json`);
    }
    const actual = parseMetaChain(parent, pkg.scripts[parent]);
    if (!arraysEqual(actual, expectedChildren)) {
      fail(
        `Topology mismatch for ${JSON.stringify(parent)}.\n  expected: ${expectedChildren.join(' && ')}\n  actual:   ${actual.join(' && ')}`
      );
    }
    for (const child of expectedChildren) {
      if (!Object.prototype.hasOwnProperty.call(pkg.scripts, child)) {
        fail(`Topology: child ${JSON.stringify(child)} referenced by ${JSON.stringify(parent)} is not defined in package.json`);
      }
    }
  }

  console.log('OK: deterministic execution meta-command topology matches expected ordered npm-run chains.');
}

main();
