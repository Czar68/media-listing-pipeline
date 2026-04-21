import type { ErrorType, ExecutionResult } from "../execution/types";
import {
  countErrorTypes,
  recoveryStats,
  successFailureRates,
} from "./aggregateExecutionStats";
import type { ListingQualityComparison } from "./validationScoringTypes";
/** Stable key order for JSON serialization and cross-run comparison. */
export const ALL_ERROR_TYPES_ORDERED: readonly ErrorType[] = [
  "AUTH_ERROR",
  "NETWORK_ERROR",
  "RATE_LIMIT",
  "SANDBOX_LIMITATION",
  "UNKNOWN",
  "VALIDATION_ERROR",
];

export interface FlattenedExecutionRow {
  readonly sku: string;
  readonly outcome: "success" | "failed";
  readonly errorType: ErrorType | null;
  readonly recovered: boolean | null;
  readonly retryCount: number | null;
}

export interface DatasetRef {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly contentHash: string;
}

export interface NormalizedExecutionSlice {
  readonly phase: "epid_disabled" | "epid_enabled" | "ebay_adversarial";
  /** Present when produced from a versioned adversarial run (required for EPID compare). */
  readonly datasetId?: string;
  readonly datasetVersion?: string;
  readonly contentHash?: string;
  readonly totalItems: number;
  readonly successCount: number;
  readonly failedCount: number;
  /** [0,1], 0 if totalItems === 0 */
  readonly successRate: number;
  /** [0,1], 0 if totalItems === 0 */
  readonly failureRate: number;
  readonly errorTypeDistribution: Record<ErrorType, number>;
  readonly recovery: {
    readonly recoveredSuccesses: number;
    readonly recoveredFailures: number;
    readonly retriesObserved: number;
  };
  /** Deterministic order: sorted by `sku` ascending (Unicode). */
  readonly items: readonly FlattenedExecutionRow[];
  readonly epidEnrichment?: {
    readonly withEpid: number;
    readonly withoutEpid: number;
    readonly tokenPresent: boolean;
  };
}

export interface NormalizedValidationReport {
  readonly schemaVersion: 2;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly contentHash: string;
  /** SHA-256 hex of canonical execution configuration for this validation invocation. */
  readonly runFingerprint: string;
  readonly dataset: {
    readonly itemCount: number;
    readonly fixedCapturedAt: string;
    readonly defaultSource: string;
  };
  readonly epidDisabled: NormalizedExecutionSlice;
  readonly epidEnabled: NormalizedExecutionSlice;
  readonly ebayAdversarial: NormalizedExecutionSlice;
  readonly ebayClassification: {
    readonly expectationsPassed: number;
    readonly expectationsFailed: number;
    /** Sorted by `sku` for stable output. */
    readonly mismatches: readonly {
      readonly sku: string;
      readonly expected: string;
      readonly actual: string;
    }[];
  };
  readonly ebayRecoveryPolicy: {
    readonly inventoryPutCountAuthSku: number;
    readonly inventoryPutCountValRetrySku: number;
    readonly valRetrySuccessWithRecoveryFlag: boolean;
    readonly failedRowsWithRetryCount: readonly { readonly sku: string; readonly retryCount: number }[];
    readonly note: string;
  };
}

export interface ValidationRunComparison {
  readonly schemaVersion: 2 | 3;
  readonly datasetId: string;
  readonly datasetVersion: string;
  /** EPID enabled minus EPID disabled (compare − baseline). */
  readonly baselineLabel: "epid_disabled";
  readonly compareLabel: "epid_enabled";
  readonly totalItems: number;
  readonly successRateDelta: number;
  readonly failureRateDelta: number;
  readonly errorTypeShifts: Record<ErrorType, number>;
  readonly recoveryDelta: {
    readonly recoveredSuccesses: number;
    readonly recoveredFailures: number;
    readonly retriesObserved: number;
  };
  /** Only rows where outcome differs; sorted by `sku`. Order-independent diff. */
  readonly perSkuOutcomeChanges: readonly {
    readonly sku: string;
    readonly baselineOutcome: "success" | "failed";
    readonly compareOutcome: "success" | "failed";
  }[];
  /** Present when comparison includes listing-quality scoring ({@link schemaVersion} 3). */
  readonly listingQuality?: ListingQualityComparison;
}

export function standardizeErrorTypeDistribution(
  partial: Readonly<Partial<Record<ErrorType, number>>>
): Record<ErrorType, number> {
  const out: Record<ErrorType, number> = {
    AUTH_ERROR: 0,
    NETWORK_ERROR: 0,
    RATE_LIMIT: 0,
    SANDBOX_LIMITATION: 0,
    UNKNOWN: 0,
    VALIDATION_ERROR: 0,
  };
  for (const t of ALL_ERROR_TYPES_ORDERED) {
    const v = partial[t];
    if (v !== undefined) {
      out[t] = v;
    }
  }
  return out;
}

export function flattenExecutionResult(execution: ExecutionResult): FlattenedExecutionRow[] {
  const rows: FlattenedExecutionRow[] = [];
  for (const s of execution.success) {
    rows.push({
      sku: String(s.item.sku),
      outcome: "success",
      errorType: null,
      recovered: s.recovered === undefined ? null : s.recovered,
      retryCount: s.retryCount === undefined ? null : s.retryCount,
    });
  }
  for (const f of execution.failed) {
    rows.push({
      sku: String(f.item.sku),
      outcome: "failed",
      errorType: f.error.type,
      recovered: f.recovered === undefined ? null : f.recovered,
      retryCount: f.retryCount === undefined ? null : f.retryCount,
    });
  }
  rows.sort((a, b) => a.sku.localeCompare(b.sku, "en"));
  return rows;
}

function ratesFromCounts(successCount: number, failedCount: number): {
  successRate: number;
  failureRate: number;
  totalItems: number;
} {
  const totalItems = successCount + failedCount;
  if (totalItems === 0) {
    return { successRate: 0, failureRate: 0, totalItems: 0 };
  }
  return {
    successRate: successCount / totalItems,
    failureRate: failedCount / totalItems,
    totalItems,
  };
}

export function normalizeExecutionSlice(
  phase: NormalizedExecutionSlice["phase"],
  execution: ExecutionResult,
  epidEnrichment?: NormalizedExecutionSlice["epidEnrichment"],
  datasetRef?: DatasetRef
): NormalizedExecutionSlice {
  const rates = successFailureRates(execution);
  const { successRate, failureRate } = ratesFromCounts(rates.successCount, rates.failedCount);
  const dist = countErrorTypes(execution) as Partial<Record<ErrorType, number>>;
  return {
    phase,
    ...(datasetRef !== undefined
      ? {
          datasetId: datasetRef.datasetId,
          datasetVersion: datasetRef.datasetVersion,
          contentHash: datasetRef.contentHash,
        }
      : {}),
    totalItems: rates.totalItems,
    successCount: rates.successCount,
    failedCount: rates.failedCount,
    successRate,
    failureRate,
    errorTypeDistribution: standardizeErrorTypeDistribution(dist),
    recovery: recoveryStats(execution),
    items: flattenExecutionResult(execution),
    ...(epidEnrichment !== undefined ? { epidEnrichment } : {}),
  };
}

function outcomeBySku(items: readonly FlattenedExecutionRow[]): Map<string, "success" | "failed"> {
  const m = new Map<string, "success" | "failed">();
  for (const row of items) {
    m.set(row.sku, row.outcome);
  }
  return m;
}

/**
 * Compares EPID-off vs EPID-on normalized slices. Metrics use set semantics on SKU
 * (maps), not array order.
 * Requires matching {@link DatasetRef} on both slices (hard gate on version).
 */
export function compareValidationRuns(
  epidDisabled: NormalizedExecutionSlice,
  epidEnabled: NormalizedExecutionSlice
): ValidationRunComparison {
  const base = epidDisabled;
  const cmp = epidEnabled;
  const idA = base.datasetId;
  const idB = cmp.datasetId;
  const verA = base.datasetVersion;
  const verB = cmp.datasetVersion;
  if (
    idA === undefined ||
    idB === undefined ||
    verA === undefined ||
    verB === undefined
  ) {
    throw new Error(
      "compareValidationRuns: both slices must include datasetId and datasetVersion (use versioned normalization)"
    );
  }
  if (idA !== idB) {
    throw new Error(`compareValidationRuns: datasetId mismatch (${idA} vs ${idB})`);
  }
  if (verA !== verB) {
    throw new Error(`compareValidationRuns: datasetVersion mismatch (${verA} vs ${verB})`);
  }
  const totalItems = base.totalItems;
  const shifts: Record<ErrorType, number> = {
    AUTH_ERROR: 0,
    NETWORK_ERROR: 0,
    RATE_LIMIT: 0,
    SANDBOX_LIMITATION: 0,
    UNKNOWN: 0,
    VALIDATION_ERROR: 0,
  };
  for (const t of ALL_ERROR_TYPES_ORDERED) {
    shifts[t] = cmp.errorTypeDistribution[t] - base.errorTypeDistribution[t];
  }

  const baseMap = outcomeBySku(base.items);
  const cmpMap = outcomeBySku(cmp.items);
  const allSkus = new Set<string>([...baseMap.keys(), ...cmpMap.keys()]);
  const perSkuOutcomeChanges: {
    sku: string;
    baselineOutcome: "success" | "failed";
    compareOutcome: "success" | "failed";
  }[] = [];
  for (const sku of [...allSkus].sort((a, b) => a.localeCompare(b, "en"))) {
    const bo = baseMap.get(sku);
    const co = cmpMap.get(sku);
    if (bo === undefined || co === undefined) {
      continue;
    }
    if (bo !== co) {
      perSkuOutcomeChanges.push({
        sku,
        baselineOutcome: bo,
        compareOutcome: co,
      });
    }
  }

  return {
    schemaVersion: 2,
    datasetId: idA,
    datasetVersion: verA,
    baselineLabel: "epid_disabled",
    compareLabel: "epid_enabled",
    totalItems,
    successRateDelta: cmp.successRate - base.successRate,
    failureRateDelta: cmp.failureRate - base.failureRate,
    errorTypeShifts: shifts,
    recoveryDelta: {
      recoveredSuccesses: cmp.recovery.recoveredSuccesses - base.recovery.recoveredSuccesses,
      recoveredFailures: cmp.recovery.recoveredFailures - base.recovery.recoveredFailures,
      retriesObserved: cmp.recovery.retriesObserved - base.recovery.retriesObserved,
    },
    perSkuOutcomeChanges,
  };
}

export function buildNormalizedValidationReport(params: {
  readonly datasetRef: DatasetRef;
  readonly runFingerprint: string;
  readonly dataset: NormalizedValidationReport["dataset"];
  readonly runEpidOff: {
    readonly execution: ExecutionResult;
    readonly enrichedWithEpidCount: number;
    readonly enrichedWithoutEpidCount: number;
    readonly tokenPresent: boolean;
  };
  readonly runEpidOn: {
    readonly execution: ExecutionResult;
    readonly enrichedWithEpidCount: number;
    readonly enrichedWithoutEpidCount: number;
    readonly tokenPresent: boolean;
  };
  readonly runEbay: ExecutionResult;
  readonly classification: {
    readonly passed: number;
    readonly failed: number;
    readonly mismatches: readonly { readonly sku: string; readonly expected: string; readonly actual: string }[];
  };
  readonly recoveryPolicy: NormalizedValidationReport["ebayRecoveryPolicy"];
}): NormalizedValidationReport {
  const mismatches = [...params.classification.mismatches].sort((a, b) =>
    a.sku.localeCompare(b.sku, "en")
  );
  const ref = params.datasetRef;
  return {
    schemaVersion: 2,
    datasetId: ref.datasetId,
    datasetVersion: ref.datasetVersion,
    contentHash: ref.contentHash,
    runFingerprint: params.runFingerprint,
    dataset: params.dataset,
    epidDisabled: normalizeExecutionSlice(
      "epid_disabled",
      params.runEpidOff.execution,
      {
        withEpid: params.runEpidOff.enrichedWithEpidCount,
        withoutEpid: params.runEpidOff.enrichedWithoutEpidCount,
        tokenPresent: params.runEpidOff.tokenPresent,
      },
      ref
    ),
    epidEnabled: normalizeExecutionSlice(
      "epid_enabled",
      params.runEpidOn.execution,
      {
        withEpid: params.runEpidOn.enrichedWithEpidCount,
        withoutEpid: params.runEpidOn.enrichedWithoutEpidCount,
        tokenPresent: params.runEpidOn.tokenPresent,
      },
      ref
    ),
    ebayAdversarial: normalizeExecutionSlice("ebay_adversarial", params.runEbay, undefined, ref),
    ebayClassification: {
      expectationsPassed: params.classification.passed,
      expectationsFailed: params.classification.failed,
      mismatches,
    },
    ebayRecoveryPolicy: params.recoveryPolicy,
  };
}
