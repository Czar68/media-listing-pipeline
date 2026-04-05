'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT = 'media-listing-execution-full-snapshot.json';
const REQUIRED_TOP_LEVEL = ['fixture', 'pipeline', 'plan', 'run', 'report', 'bundle'];

function main() {
  const artifactPath = path.join(__dirname, '..', 'artifacts', ARTIFACT);

  let raw;
  try {
    raw = fs.readFileSync(artifactPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`Execution full snapshot not found (expected at script-relative path): ${artifactPath}`);
    } else {
      console.error(`Cannot read execution full snapshot at ${artifactPath}: ${err && err.message ? err.message : err}`);
    }
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON in ${ARTIFACT}: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    console.error(`${ARTIFACT} must be a JSON object at the top level.`);
    process.exit(1);
  }

  const missing = REQUIRED_TOP_LEVEL.filter((key) => !Object.prototype.hasOwnProperty.call(data, key));
  if (missing.length > 0) {
    console.error(`${ARTIFACT} is missing required top-level section(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(
    `OK: ${ARTIFACT} — required aggregate sections present: ${REQUIRED_TOP_LEVEL.join(', ')}`
  );
}

main();
