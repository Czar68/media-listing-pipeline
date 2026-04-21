import { randomUUID } from "crypto";
import { runBatch } from "../runBatch";
import type { ErrorType, ExecutionResult } from "../execution/types";
import {
  ADVERSARIAL_DATASET_DEFINITION_VERSION,
  ADVERSARIAL_EXTERNAL_IDS,
  ADVERSARIAL_SCAN_OPTIONS,
  createAdversarialBatchInputs,
  expectedSku,
} from "./adversarialDataset";
import { resolveDatasetIdentity } from "./datasetIdentity";
import {
  computeRunFingerprint,
  EvaluationRunRegistry,
  defaultAdversarialRunPhases,
  EXECUTOR_RETRY_POLICY_LABEL,
} from "./evaluationRunRegistry";
import { ValidationDatasetRegistry } from "./validationDatasetRegistry";
import {
  countEnrichedWithEpid,
  countErrorTypes,
  recoveryStats,
  successFailureRates,
} from "./aggregateExecutionStats";
import {
  installEbayClientStubForValidation,
  type InventoryPutCounts,
} from "./ebayClientStub";
import type { RunBatchWithTraceResult } from "../runBatch";
import type {
  AdversarialValidationOutput,
  AdversarialValidationReport,
} from "./adversarialReportTypes";
import { buildEpidListingQualityComparison } from "./epidListingQualityComparison";
import { buildNormalizedValidationReport } from "./normalizeValidationReport";

export type { AdversarialValidationReport, AdversarialValidationOutput } from "./adversarialReportTypes";

const DEFAULT_SOURCE = "adversarial-validation";

function expectedOutcomeForSku(sku: string): "SUCCESS" | ErrorType {
  const e = ADVERSARIAL_EXTERNAL_IDS;
  if (sku === expectedSku(DEFAULT_SOURCE, e.ok)) return "SUCCESS";
  if (sku === expectedSku(DEFAULT_SOURCE, e.auth)) return "AUTH_ERROR";
  if (sku === expectedSku(DEFAULT_SOURCE, e.rate)) return "RATE_LIMIT";
  if (sku === expectedSku(DEFAULT_SOURCE, e.net)) return "NETWORK_ERROR";
  if (sku === expectedSku(DEFAULT_SOURCE, e.valRetry)) return "SUCCESS";
  if (sku === expectedSku(DEFAULT_SOURCE, e.sandbox)) return "SANDBOX_LIMITATION";
  return "SUCCESS";
}

function installDeterministicBrowseFetchMock(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input: unknown, init?: unknown) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : typeof input === "object" && input !== null && "url" in input
            ? String((input as { url: string }).url)
            : "";
    if (url.includes("/buy/browse/v1/item_summary/search")) {
      return new Response(
        JSON.stringify({
          itemSummaries: [
            {
              categoryId: "111422",
              product: { epid: "50000000001" },
              localizedAspects: [{ name: "Brand", value: "StubBrand" }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (typeof original === "function") {
      return (original as typeof globalThis.fetch).call(globalThis, input as never, init as never);
    }
    throw new Error("globalThis.fetch unavailable for non-Browse URL in adversarial mock");
  };
  return () => {
    globalThis.fetch = original;
  };
}

function cloneEnv(keys: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) {
    out[k] = process.env[k];
  }
  return out;
}

function applyEnv(snapshot: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function classifyExpectations(execution: ExecutionResult): {
  passed: number;
  failed: number;
  mismatches: { sku: string; expected: string; actual: string }[];
} {
  const mismatches: { sku: string; expected: string; actual: string }[] = [];
  let passed = 0;
  let failed = 0;

  for (const s of execution.success) {
    const sku = String(s.item.sku);
    const exp = expectedOutcomeForSku(sku);
    if (exp === "SUCCESS") {
      passed += 1;
    } else {
      failed += 1;
      mismatches.push({
        sku,
        expected: exp,
        actual: "SUCCESS",
      });
    }
  }

  for (const f of execution.failed) {
    const sku = String(f.item.sku);
    const exp = expectedOutcomeForSku(sku);
    const act = f.error.type;
    if (exp === act) {
      passed += 1;
    } else {
      failed += 1;
      mismatches.push({
        sku,
        expected: exp,
        actual: act,
      });
    }
  }

  return { passed, failed, mismatches };
}

/**
 * Controlled adversarial validation: deterministic dataset, mock executor EPID A/B,
 * then ebay executor with a harness-only `ebayClient` stub (no pipeline source edits).
 */
export async function runAdversarialValidation(): Promise<AdversarialValidationOutput> {
  const inputs = createAdversarialBatchInputs();
  const datasetIdentity = resolveDatasetIdentity(
    inputs,
    ADVERSARIAL_SCAN_OPTIONS,
    ADVERSARIAL_DATASET_DEFINITION_VERSION
  );
  const registeredDataset = ValidationDatasetRegistry.register(datasetIdentity);
  const runId = randomUUID();
  const runPhases = defaultAdversarialRunPhases();
  const runFingerprint = computeRunFingerprint({
    phases: runPhases,
    executorRetryPolicy: EXECUTOR_RETRY_POLICY_LABEL,
  });

  const envKeys = ["EXECUTION_MODE", "EBAY_APP_TOKEN"] as const;
  const saved = cloneEnv(envKeys);

  const authSku = expectedSku(DEFAULT_SOURCE, ADVERSARIAL_EXTERNAL_IDS.auth);
  const valRetrySku = expectedSku(DEFAULT_SOURCE, ADVERSARIAL_EXTERNAL_IDS.valRetry);

  try {
    process.env.EXECUTION_MODE = "mock";
    delete process.env.EBAY_APP_TOKEN;

    const runEpidOff = await runBatch(inputs, ADVERSARIAL_SCAN_OPTIONS);
    const epidOffStats = {
      tokenPresent: Boolean(String(process.env.EBAY_APP_TOKEN ?? "").trim()),
      enrichedWithEpidCount: countEnrichedWithEpid(runEpidOff.enrichedInventoryItems).withEpid,
      enrichedWithoutEpidCount: countEnrichedWithEpid(runEpidOff.enrichedInventoryItems).withoutEpid,
      execution: successFailureRates(runEpidOff.execution),
      errorTypeDistribution: countErrorTypes(runEpidOff.execution),
    };

    process.env.EBAY_APP_TOKEN = "adversarial-deterministic-browse-token";
    const restoreFetch = installDeterministicBrowseFetchMock();
    let runEpidOn;
    try {
      runEpidOn = await runBatch(inputs, ADVERSARIAL_SCAN_OPTIONS);
    } finally {
      restoreFetch();
    }

    const epidOnStats = {
      tokenPresent: Boolean(String(process.env.EBAY_APP_TOKEN ?? "").trim()),
      enrichedWithEpidCount: countEnrichedWithEpid(runEpidOn.enrichedInventoryItems).withEpid,
      enrichedWithoutEpidCount: countEnrichedWithEpid(runEpidOn.enrichedInventoryItems).withoutEpid,
      execution: successFailureRates(runEpidOn.execution),
      errorTypeDistribution: countErrorTypes(runEpidOn.execution),
    };

    const epidSummary = [
      `EPID fields present: disabled run ${epidOffStats.enrichedWithEpidCount}, enabled run ${epidOnStats.enrichedWithEpidCount}`,
      `Execution successes: disabled ${epidOffStats.execution.successCount}, enabled ${epidOnStats.execution.successCount}`,
    ].join(" | ");

    const stub = installEbayClientStubForValidation();
    process.env.EXECUTION_MODE = "ebay";
    delete process.env.EBAY_APP_TOKEN;

    let runEbay!: RunBatchWithTraceResult;
    let puts!: InventoryPutCounts;
    try {
      runEbay = await runBatch(inputs, ADVERSARIAL_SCAN_OPTIONS);
      puts = stub.getInventoryPutCounts();
    } finally {
      stub.restore();
    }

    const valRetrySuccess = runEbay.execution.success.find(
      (s) => String(s.item.sku) === valRetrySku
    );
    const failedRowsWithRetryCount = runEbay.execution.failed
      .filter((f) => (f.retryCount ?? 0) > 0)
      .map((f) => ({ sku: String(f.item.sku), retryCount: f.retryCount ?? 0 }));

    const raw: AdversarialValidationReport = {
      dataset: {
        itemCount: inputs.length,
        fixedCapturedAt: ADVERSARIAL_SCAN_OPTIONS.capturedAt ?? "",
        defaultSource: ADVERSARIAL_SCAN_OPTIONS.defaultSource ?? DEFAULT_SOURCE,
        datasetId: datasetIdentity.datasetId,
        datasetVersion: datasetIdentity.datasetVersion,
        contentHash: datasetIdentity.contentHash,
      },
      epidComparison: {
        enrichmentDisabled: epidOffStats,
        enrichmentEnabled: epidOnStats,
        summary: epidSummary,
      },
      ebayExecutorAdversarial: {
        executionMode: "ebay",
        successFailureRates: successFailureRates(runEbay.execution),
        errorTypeDistribution: countErrorTypes(runEbay.execution),
        recovery: recoveryStats(runEbay.execution),
        classificationExpectations: classifyExpectations(runEbay.execution),
        recoveryPolicySignals: {
          inventoryPutCountAuthSku: puts[authSku] ?? 0,
          inventoryPutCountValRetrySku: puts[valRetrySku] ?? 0,
          valRetrySuccessWithRecoveryFlag: valRetrySuccess?.recovered === true,
          failedRowsWithRetryCount,
          note:
            "Auth SKU expects a single inventory PUT (no retry). Val-retry SKU expects two PUTs and a recovered success when VALIDATION_ERROR triggers one retry. Non-validation failures should not increment retryCount.",
        },
      },
    };

    const classification = raw.ebayExecutorAdversarial.classificationExpectations;
    const normalized = buildNormalizedValidationReport({
      datasetRef: {
        datasetId: datasetIdentity.datasetId,
        datasetVersion: datasetIdentity.datasetVersion,
        contentHash: datasetIdentity.contentHash,
      },
      runFingerprint,
      dataset: {
        itemCount: raw.dataset.itemCount,
        fixedCapturedAt: raw.dataset.fixedCapturedAt,
        defaultSource: raw.dataset.defaultSource,
      },
      runEpidOff: {
        execution: runEpidOff.execution,
        enrichedWithEpidCount: epidOffStats.enrichedWithEpidCount,
        enrichedWithoutEpidCount: epidOffStats.enrichedWithoutEpidCount,
        tokenPresent: epidOffStats.tokenPresent,
      },
      runEpidOn: {
        execution: runEpidOn.execution,
        enrichedWithEpidCount: epidOnStats.enrichedWithEpidCount,
        enrichedWithoutEpidCount: epidOnStats.enrichedWithoutEpidCount,
        tokenPresent: epidOnStats.tokenPresent,
      },
      runEbay: runEbay.execution,
      classification: {
        passed: classification.passed,
        failed: classification.failed,
        mismatches: classification.mismatches,
      },
      recoveryPolicy: raw.ebayExecutorAdversarial.recoveryPolicySignals,
    });

    const { comparison, insights } = buildEpidListingQualityComparison(normalized);

    const evaluationRun = {
      runId,
      datasetId: datasetIdentity.datasetId,
      datasetVersion: datasetIdentity.datasetVersion,
      contentHash: datasetIdentity.contentHash,
      timestamp: new Date().toISOString(),
      phases: runPhases,
      runFingerprint,
    };
    EvaluationRunRegistry.record(evaluationRun);

    const output: AdversarialValidationOutput = {
      raw,
      normalized,
      comparison,
      insights,
      evaluation: {
        run: evaluationRun,
        registeredDataset,
      },
    };

    return output;
  } finally {
    applyEnv(saved);
  }
}
