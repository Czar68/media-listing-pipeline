"use strict";

const path = require("path");

process.chdir(path.join(__dirname, ".."));

const {
  runAdversarialValidation,
} = require("../adapters/media-pipeline/dist/validation/runAdversarialValidation.js");

runAdversarialValidation()
  .then((output) => {
    console.log(JSON.stringify(output, null, 2));
    const report = output.raw;
    const c = report.ebayExecutorAdversarial.classificationExpectations;
    const r = report.ebayExecutorAdversarial.recoveryPolicySignals;
    if (c.failed > 0 || r.failedRowsWithRetryCount.length > 0) {
      process.exitCode = 1;
    }
    if (r.inventoryPutCountAuthSku !== 1 || r.inventoryPutCountValRetrySku !== 2) {
      process.exitCode = 1;
    }
    if (!r.valRetrySuccessWithRecoveryFlag) {
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
