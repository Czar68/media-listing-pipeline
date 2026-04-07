'use strict';

const fs = require('fs');
const path = require('path');

const INVENTORY_REL = 'artifacts/media-listing-deterministic-execution-inventory-contract.json';

const EXPECTED_TOP_KEYS = ['schemaVersion', 'aggregateCommand', 'aggregateMembers', 'layers'];

const EXPECTED_LAYER_IDS = [
  'full-snapshot',
  'execution-package',
  'execution-surface',
  'top-level-deterministic-execution',
];

const EXPECTED_AGGREGATE_MEMBERS = [
  'verify:media-listing:deterministic-execution-contract',
  'verify:media-listing:deterministic-execution-package',
  'verify:media-listing:deterministic-execution-surface',
  'verify:media-listing:deterministic-execution-surface-package',
];

const VERIFIER_OBJECT_KEYS = ['command', 'inAggregateGate'];

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

  return { raw, data };
}

function assertKeyOrder(obj, expectedKeys, ctx) {
  const actual = Object.keys(obj);
  if (actual.length !== expectedKeys.length) {
    fail(`${ctx}: expected keys [${expectedKeys.join(', ')}], got [${actual.join(', ')}]`);
  }
  for (let i = 0; i < expectedKeys.length; i++) {
    if (actual[i] !== expectedKeys[i]) {
      fail(`${ctx}: key order drift at index ${i}: expected "${expectedKeys[i]}", found "${actual[i]}"`);
    }
  }
}

function isSortedLexicographically(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1] >= arr[i]) return false;
  }
  return true;
}

function parseAggregateScript(scriptBody) {
  const parts = scriptBody.split('&&').map((s) => s.trim());
  const out = [];
  const re = /^npm run (.+)$/;
  for (const p of parts) {
    const m = p.match(re);
    if (!m) {
      fail(`aggregate script has unexpected segment (expected "npm run <script>"): ${JSON.stringify(p)}`);
    }
    out.push(m[1]);
  }
  return out;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const inventoryPath = path.join(repoRoot, ...INVENTORY_REL.split('/'));
  const { raw: inventoryRaw, data: inv } = readJsonFile('deterministic execution inventory contract', inventoryPath);

  if (inventoryRaw.includes('\r\n')) {
    fail('Inventory contract must use LF newlines only (no CRLF).');
  }

  if (!isPlainObject(inv)) {
    fail('Inventory contract root must be a plain JSON object.');
  }

  assertKeyOrder(inv, EXPECTED_TOP_KEYS, 'inventory contract top-level');

  if (inv.schemaVersion !== 1) {
    fail(`inventory schemaVersion must be 1; got ${JSON.stringify(inv.schemaVersion)}`);
  }

  if (inv.aggregateCommand !== 'verify:media-listing:deterministic-execution') {
    fail(`aggregateCommand must be verify:media-listing:deterministic-execution; got ${JSON.stringify(inv.aggregateCommand)}`);
  }

  if (!Array.isArray(inv.aggregateMembers)) {
    fail('aggregateMembers must be an array.');
  }
  if (inv.aggregateMembers.length !== EXPECTED_AGGREGATE_MEMBERS.length) {
    fail(
      `aggregateMembers length must be ${EXPECTED_AGGREGATE_MEMBERS.length}; got ${inv.aggregateMembers.length}`
    );
  }
  for (let i = 0; i < EXPECTED_AGGREGATE_MEMBERS.length; i++) {
    if (inv.aggregateMembers[i] !== EXPECTED_AGGREGATE_MEMBERS[i]) {
      fail(
        `aggregateMembers[${i}] must be ${JSON.stringify(EXPECTED_AGGREGATE_MEMBERS[i])}; got ${JSON.stringify(inv.aggregateMembers[i])}`
      );
    }
  }

  if (!Array.isArray(inv.layers)) {
    fail('layers must be an array.');
  }
  if (inv.layers.length !== EXPECTED_LAYER_IDS.length) {
    fail(`layers length must be ${EXPECTED_LAYER_IDS.length}; got ${inv.layers.length}`);
  }

  const pkgPath = path.join(repoRoot, 'package.json');
  const { data: pkg } = readJsonFile('package.json', pkgPath);
  if (!pkg.scripts || typeof pkg.scripts !== 'object') {
    fail('package.json must define a scripts object.');
  }

  const aggregateBody = pkg.scripts['verify:media-listing:deterministic-execution'];
  if (typeof aggregateBody !== 'string') {
    fail('package.json must define verify:media-listing:deterministic-execution as a string.');
  }
  const parsedAgg = parseAggregateScript(aggregateBody);
  if (parsedAgg.length !== EXPECTED_AGGREGATE_MEMBERS.length) {
    fail(
      `verify:media-listing:deterministic-execution must chain ${EXPECTED_AGGREGATE_MEMBERS.length} npm run steps; parsed ${parsedAgg.length}`
    );
  }
  for (let i = 0; i < EXPECTED_AGGREGATE_MEMBERS.length; i++) {
    if (parsedAgg[i] !== EXPECTED_AGGREGATE_MEMBERS[i]) {
      fail(
        `aggregate script membership drift at index ${i}: expected ${JSON.stringify(EXPECTED_AGGREGATE_MEMBERS[i])}, parsed ${JSON.stringify(parsedAgg[i])}`
      );
    }
  }

  const seenLayerIds = new Set();
  const seenCommandsGlobal = new Set();

  for (let li = 0; li < inv.layers.length; li++) {
    const layer = inv.layers[li];
    const ctx = `layers[${li}]`;
    if (!isPlainObject(layer)) {
      fail(`${ctx} must be a plain object.`);
    }
    assertKeyOrder(layer, ['id', 'checkedInPaths', 'verifiers'], ctx);

    if (typeof layer.id !== 'string') {
      fail(`${ctx}.id must be a string.`);
    }
    if (layer.id !== EXPECTED_LAYER_IDS[li]) {
      fail(`${ctx}.id must be ${JSON.stringify(EXPECTED_LAYER_IDS[li])} at position ${li}; got ${JSON.stringify(layer.id)}`);
    }
    if (seenLayerIds.has(layer.id)) {
      fail(`duplicate layer id: ${JSON.stringify(layer.id)}`);
    }
    seenLayerIds.add(layer.id);

    if (!Array.isArray(layer.checkedInPaths)) {
      fail(`${ctx}.checkedInPaths must be an array.`);
    }
    const paths = layer.checkedInPaths;
    if (paths.length === 0) {
      fail(`${ctx}.checkedInPaths must be non-empty.`);
    }
    const pathSet = new Set();
    for (const rel of paths) {
      if (typeof rel !== 'string') {
        fail(`${ctx}.checkedInPaths entries must be strings.`);
      }
      if (pathSet.has(rel)) {
        fail(`${ctx}.checkedInPaths has duplicate path ${JSON.stringify(rel)}`);
      }
      pathSet.add(rel);
    }
    if (!isSortedLexicographically(paths)) {
      fail(`${ctx}.checkedInPaths must be sorted lexicographically with strict ordering.`);
    }

    if (!Array.isArray(layer.verifiers)) {
      fail(`${ctx}.verifiers must be an array.`);
    }
    if (layer.verifiers.length === 0) {
      fail(`${ctx}.verifiers must be non-empty.`);
    }

    const cmds = [];
    for (let vi = 0; vi < layer.verifiers.length; vi++) {
      const v = layer.verifiers[vi];
      const vctx = `${ctx}.verifiers[${vi}]`;
      if (!isPlainObject(v)) {
        fail(`${vctx} must be a plain object.`);
      }
      assertKeyOrder(v, VERIFIER_OBJECT_KEYS, vctx);
      if (typeof v.command !== 'string' || v.command.length === 0) {
        fail(`${vctx}.command must be a non-empty string.`);
      }
      if (typeof v.inAggregateGate !== 'boolean') {
        fail(`${vctx}.inAggregateGate must be a boolean.`);
      }
      cmds.push(v.command);
      if (seenCommandsGlobal.has(v.command)) {
        fail(`duplicate verifier command across inventory: ${JSON.stringify(v.command)}`);
      }
      seenCommandsGlobal.add(v.command);

      const scriptName = v.command;
      if (!Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName)) {
        fail(`missing npm script required by inventory: ${JSON.stringify(scriptName)}`);
      }
    }

    for (let i = 1; i < cmds.length; i++) {
      if (cmds[i - 1] >= cmds[i]) {
        fail(`${ctx}.verifiers must be sorted lexicographically by command (strict).`);
      }
    }

    for (const rel of paths) {
      const abs = path.join(repoRoot, ...rel.split('/'));
      try {
        fs.accessSync(abs, fs.constants.R_OK);
      } catch {
        fail(`missing checked-in repo-root path listed in inventory: ${rel}`);
      }
    }
  }

  const inventoryInPaths = new Set();
  for (const layer of inv.layers) {
    for (const p of layer.checkedInPaths) {
      inventoryInPaths.add(p);
    }
  }
  if (!inventoryInPaths.has(INVENTORY_REL)) {
    fail(`inventory contract must list itself in some layer checkedInPaths: ${INVENTORY_REL}`);
  }

  console.log(
    'OK: deterministic execution inventory contract shape, paths, npm scripts, aggregate membership, and ordering checks passed.'
  );
}

main();
