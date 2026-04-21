import type { ErrorType, ExecutionResult } from "../execution/types";
import type { EpidEnrichedInventoryItem } from "../epidEnricher";

export type ErrorTypeCounts = Partial<Record<ErrorType | "UNKNOWN_SHAPE", number>>;

export function countErrorTypes(execution: ExecutionResult): ErrorTypeCounts {
  const out: ErrorTypeCounts = {};
  for (const f of execution.failed) {
    const t = f.error.type;
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

export function successFailureRates(execution: ExecutionResult): {
  readonly successCount: number;
  readonly failedCount: number;
  readonly totalItems: number;
} {
  const successCount = execution.success.length;
  const failedCount = execution.failed.length;
  return {
    successCount,
    failedCount,
    totalItems: successCount + failedCount,
  };
}

export function countEnrichedWithEpid(
  enriched: readonly EpidEnrichedInventoryItem[]
): { readonly withEpid: number; readonly withoutEpid: number } {
  let withEpid = 0;
  let withoutEpid = 0;
  for (const row of enriched) {
    if (row.epid !== undefined && String(row.epid).trim() !== "") {
      withEpid += 1;
    } else {
      withoutEpid += 1;
    }
  }
  return { withEpid, withoutEpid };
}

export function recoveryStats(execution: ExecutionResult): {
  readonly recoveredSuccesses: number;
  readonly recoveredFailures: number;
  readonly retriesObserved: number;
} {
  let recoveredSuccesses = 0;
  let recoveredFailures = 0;
  let retriesObserved = 0;
  for (const s of execution.success) {
    if (s.recovered === true) recoveredSuccesses += 1;
    if ((s.retryCount ?? 0) > 0) retriesObserved += 1;
  }
  for (const f of execution.failed) {
    if (f.recovered === true) recoveredFailures += 1;
    if ((f.retryCount ?? 0) > 0) retriesObserved += 1;
  }
  return { recoveredSuccesses, recoveredFailures, retriesObserved };
}
