'use strict';

/**
 * Repo-root deterministic execution script wiring audit.
 *
 * Validates a 1:1 mapping between allowlisted npm verifier commands and validator
 * files under scripts/, using the repo's standard `node scripts/<file>.js` form.
 *
 * Meta commands that only chain other npm scripts (no single direct node target)
 * are out of scope here — see EXCLUDED_META_COMMANDS.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPTS_DIR = __dirname;

/** Commands that intentionally compose other commands; they must not be `node scripts/...` only. */
const EXCLUDED_META_COMMANDS = new Set([
  'verify:media-listing:deterministic-execution',
  'verify:media-listing:deterministic-execution-audit',
  'verify:media-listing:deterministic-execution-stack',
  'verify:media-listing:deterministic-execution-surface',
  'verify:media-listing:deterministic-execution-surface-package',
]);

/**
 * Each entry: npm script name -> path under repo root (forward slashes).
 * Must stay in bijection with validator files on disk (see VALIDATOR_FILE_BASENAMES).
 */
const EXPECTED_DIRECT_WIRES = [
  ['verify:media-listing:deterministic-execution-inventory', 'scripts/validate-deterministic-execution-inventory.js'],
  ['verify:media-listing:deterministic-execution-coverage', 'scripts/validate-deterministic-execution-coverage.js'],
  ['verify:media-listing:deterministic-execution-script-wiring', 'scripts/validate-deterministic-execution-script-wiring.js'],
  ['verify:media-listing:deterministic-execution-command-policy', 'scripts/validate-deterministic-execution-command-policy.js'],
  ['verify:media-listing:deterministic-execution-command-topology', 'scripts/validate-deterministic-execution-command-topology.js'],
  ['verify:media-listing:deterministic-execution-verifier-classification', 'scripts/validate-deterministic-execution-verifier-classification.js'],
  ['verify:media-listing:deterministic-execution-contract', 'scripts/verify-deterministic-execution-contract.js'],
  ['verify:media-listing:deterministic-execution-package', 'scripts/verify-deterministic-execution-package.js'],
  ['verify:media-listing:deterministic-execution-stack-package-loader', 'scripts/verify-deterministic-execution-stack-package-loader.js'],
  ['verify:media-listing:deterministic-execution-stack-package-contract', 'scripts/verify-deterministic-execution-stack-package-contract.js'],
  ['verify:media-listing:deterministic-execution-stack-package-package', 'scripts/verify-deterministic-execution-stack-package-package.js'],
  ['verify:media-listing:deterministic-execution-surface-package-contract', 'scripts/verify-deterministic-execution-surface-package-contract.js'],
  ['verify:media-listing:deterministic-execution-surface-package-package', 'scripts/verify-deterministic-execution-surface-package-package.js'],
  ['verify:media-listing:deterministic-execution-surface-package-loader', 'scripts/verify-deterministic-execution-surface-package-loader.js'],
];

const DIRECT_NODE_BODY = /^node scripts\/[^ ]+\.js$/;

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

function discoverValidatorFilesOnDisk() {
  let names;
  try {
    names = fs.readdirSync(SCRIPTS_DIR);
  } catch (e) {
    fail(`Cannot read scripts directory: ${e && e.message ? e.message : e}`);
  }
  return names.filter(
    (n) =>
      n.endsWith('.js') &&
      (n.startsWith('verify-deterministic-execution') || n.startsWith('validate-deterministic-execution'))
  );
}

function main() {
  const pkg = readPackageJson();
  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    fail('package.json must define scripts.');
  }

  const expectedRelByCmd = new Map(EXPECTED_DIRECT_WIRES);
  const expectedCmds = new Set(expectedRelByCmd.keys());
  const expectedPaths = new Set(expectedRelByCmd.values());

  if (expectedRelByCmd.size !== EXPECTED_DIRECT_WIRES.length) {
    fail('INTERNAL: duplicate command in EXPECTED_DIRECT_WIRES.');
  }
  if (expectedPaths.size !== EXPECTED_DIRECT_WIRES.length) {
    fail('INTERNAL: duplicate script path in EXPECTED_DIRECT_WIRES (ambiguous wiring).');
  }

  const prefix = 'verify:media-listing:deterministic-execution';
  const allDeterministicCommands = Object.keys(pkg.scripts).filter((k) => k.startsWith(prefix));

  for (const cmd of allDeterministicCommands) {
    if (EXCLUDED_META_COMMANDS.has(cmd)) {
      const body = pkg.scripts[cmd];
      if (typeof body !== 'string') fail(`${cmd} must be a string.`);
      if (DIRECT_NODE_BODY.test(body.trim())) {
        fail(
          `${cmd} is registered as a meta/chained command but its body looks like a direct node invocation; fix EXCLUDED_META_COMMANDS or wiring.`
        );
      }
      continue;
    }

    if (!expectedCmds.has(cmd)) {
      fail(
        `Unexpected repo-root npm command ${JSON.stringify(cmd)}: add to EXPECTED_DIRECT_WIRES (if direct node) or EXCLUDED_META_COMMANDS (if chained).`
      );
    }

    const body = pkg.scripts[cmd];
    if (typeof body !== 'string') {
      fail(`package.json scripts[${JSON.stringify(cmd)}] must be a string.`);
    }
    const trimmed = body.trim();
    if (!DIRECT_NODE_BODY.test(trimmed)) {
      fail(
        `${cmd} must be wired as exactly: node scripts/<name>.js (no chaining). Got: ${JSON.stringify(trimmed)}`
      );
    }

    const expectedRel = expectedRelByCmd.get(cmd);
    const suffix = trimmed.slice('node '.length);
    if (suffix !== expectedRel) {
      fail(`${cmd} must invoke ${JSON.stringify(expectedRel)}; got ${JSON.stringify(suffix)}`);
    }

    const abs = path.join(REPO_ROOT, ...expectedRel.split('/'));
    try {
      fs.accessSync(abs, fs.constants.R_OK);
    } catch {
      fail(`Missing validator script file for ${cmd}: ${expectedRel}`);
    }
  }

  for (const cmd of expectedCmds) {
    if (!Object.prototype.hasOwnProperty.call(pkg.scripts, cmd)) {
      fail(`package.json is missing required npm script: ${cmd}`);
    }
  }

  const onDisk = discoverValidatorFilesOnDisk().sort();
  const expectedBasenames = [...expectedPaths]
    .map((rel) => path.basename(rel))
    .sort();

  if (onDisk.length !== expectedBasenames.length) {
    const extra = onDisk.filter((b) => !expectedBasenames.includes(b));
    const missing = expectedBasenames.filter((b) => !onDisk.includes(b));
    const parts = [];
    if (extra.length) parts.push(`orphan validator file(s) on disk (unwired): ${extra.join(', ')}`);
    if (missing.length) parts.push(`expected file(s) missing from scripts/: ${missing.join(', ')}`);
    fail(`Validator script file set does not match allowlist.\n${parts.join('\n')}`);
  }
  for (let i = 0; i < onDisk.length; i++) {
    if (onDisk[i] !== expectedBasenames[i]) {
      fail(
        `Validator script basename mismatch at index ${i}: on disk ${JSON.stringify(onDisk[i])} vs expected ${JSON.stringify(expectedBasenames[i])}`
      );
    }
  }

  console.log(
    'OK: deterministic execution npm verifier commands and scripts/ validator files are wired 1:1 with consistent node invocation.'
  );
}

main();
