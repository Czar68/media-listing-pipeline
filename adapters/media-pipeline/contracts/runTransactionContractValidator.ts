import type { EbayInventoryItem } from "../ebayMapper";
import type { FinalListingRecord } from "../finalization/finalListingRecord";
import type { ListingDecision } from "../pricing/listingDecisionEngine";
import type { ExecutionFailed, ExecutionResult, ExecutionSuccess } from "../execution/types";
import type { EpidEnrichedInventoryItem } from "../epidEnricher";

const PRICE_EPS = 0.005;

export type ContractWarningCode =
  | "EPID_DRIFT_WARNING"
  | "EPID_CRITICAL_MISMATCH"
  | "EPID_UNRESOLVED_WARNING"
  | "MARKET_SNAPSHOT_DRIFT_WARNING"
  | "EXECUTION_PRICE_NON_AUTHORITATIVE_FLAG"
  | "PROFIT_MODEL_DIVERGENCE_WARNING"
  | "RUN_TRANSACTION_MULTI_SOURCE_WARNING";

export interface ContractWarning {
  readonly code: ContractWarningCode;
  readonly sku?: string;
}

export interface RunTransactionContractValidationSummary {
  readonly totalSkus: number;
  readonly epidDriftCount: number;
  readonly snapshotDriftCount: number;
  readonly priceMismatches: number;
  readonly unresolvedSkuCount: number;
  readonly epidsResolvedCount: number;
}

export interface RunTransactionContractValidationResult {
  readonly isCompliant: boolean;
  readonly warnings: ContractWarning[];
  readonly summary: RunTransactionContractValidationSummary;
}

export interface ValidateRunTransactionContractV1Input {
  readonly records: readonly FinalListingRecord[];
  /**
   * Optional parallel decisions (e.g. from a separate pipeline pass). When present, entries are
   * matched by `ListingDecision.sku` to the corresponding `FinalListingRecord`.
   */
  readonly listingDecisions?: readonly ListingDecision[];
  readonly execution: ExecutionResult | readonly ExecutionResult[];
  readonly canonicalBindingBySku?: Readonly<
    Record<
      string,
      {
        readonly canonicalEpid: string;
        readonly canonicalSnapshot: FinalListingRecord["marketSnapshot"] | null;
      }
    >
  >;
}

function nearlyEqualMoney(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRICE_EPS;
}

function normEpid(raw: string | undefined): string {
  if (raw === undefined) return "";
  return String(raw).trim();
}

function itemEpid(item: ExecutionSuccess["item"] | ExecutionFailed["item"]): string {
  const e = item as typeof item & Partial<EpidEnrichedInventoryItem>;
  return normEpid(e.epid);
}

function extractExecutionListPrice(payload: EbayInventoryItem): number | undefined {
  const p = payload as EbayInventoryItem & {
    price?: number | { value?: string | number };
    listingPrice?: number;
  };
  if (typeof p.price === "number" && Number.isFinite(p.price)) {
    return p.price;
  }
  if (p.price && typeof p.price === "object" && "value" in p.price) {
    const v = (p.price as { value?: string | number }).value;
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) {
      return n;
    }
  }
  if (typeof p.listingPrice === "number" && Number.isFinite(p.listingPrice)) {
    return p.listingPrice;
  }
  return undefined;
}

function snapshotKey(s: FinalListingRecord["marketSnapshot"]): string {
  return `${s.medianPrice}|${s.sampleSize}|${s.confidence}`;
}

function normalizeExecutions(
  execution: ExecutionResult | readonly ExecutionResult[]
): ExecutionResult[] {
  if (Array.isArray(execution)) {
    return [...(execution as readonly ExecutionResult[])];
  }
  return [execution as ExecutionResult];
}

function collectRowsForSku(
  executions: readonly ExecutionResult[],
  sku: string
): { readonly success?: ExecutionSuccess; readonly failed?: ExecutionFailed }[] {
  const out: { readonly success?: ExecutionSuccess; readonly failed?: ExecutionFailed }[] = [];
  for (const ex of executions) {
    for (const s of ex.success) {
      if (String(s.item.sku) === sku) {
        out.push({ success: s });
      }
    }
    for (const f of ex.failed) {
      if (String(f.item.sku) === sku) {
        out.push({ failed: f });
      }
    }
  }
  return out;
}

function firstEbayPayload(
  rows: { readonly success?: ExecutionSuccess; readonly failed?: ExecutionFailed }[]
): EbayInventoryItem | undefined {
  for (const r of rows) {
    if (r.success !== undefined) return r.success.ebayPayload;
    if (r.failed !== undefined) return r.failed.ebayPayload;
  }
  return undefined;
}

function decisionsConflict(a: ListingDecision, b: ListingDecision): boolean {
  return (
    a.sku !== b.sku ||
    a.strategyId !== b.strategyId ||
    !nearlyEqualMoney(a.recommendedPrice, b.recommendedPrice) ||
    !nearlyEqualMoney(a.minAcceptablePrice, b.minAcceptablePrice)
  );
}

function indexListingDecisionsBySku(
  decisions: readonly ListingDecision[]
): { readonly map: ReadonlyMap<string, ListingDecision>; readonly duplicateSkus: Set<string> } {
  const m = new Map<string, ListingDecision>();
  const duplicateSkus = new Set<string>();
  for (const d of decisions) {
    const sku = String(d.sku);
    if (m.has(sku)) {
      duplicateSkus.add(sku);
    }
    m.set(sku, d);
  }
  return { map: m, duplicateSkus };
}

/**
 * Read-only diagnostics for RUN_TRANSACTION_CONTRACT_V1. Does not mutate inputs or affect pipeline behavior.
 */
export function validateRunTransactionContractV1(
  input: ValidateRunTransactionContractV1Input
): RunTransactionContractValidationResult {
  const warnings: ContractWarning[] = [];
  const executions = normalizeExecutions(input.execution);
  const records = input.records;

  const skuList = records.map((r) => String(r.sku));
  const uniqueSkus = new Set(skuList);

  let epidDriftCount = 0;
  let snapshotDriftCount = 0;
  let priceMismatches = 0;
  let unresolvedSkuCount = 0;
  let epidsResolvedCount = 0;

  const externalIndexed =
    input.listingDecisions !== undefined
      ? indexListingDecisionsBySku(input.listingDecisions)
      : null;

  const recordCountBySku = new Map<string, number>();
  for (const sku of skuList) {
    recordCountBySku.set(sku, (recordCountBySku.get(sku) ?? 0) + 1);
  }

  if (externalIndexed !== null) {
    for (const sku of externalIndexed.duplicateSkus) {
      warnings.push({ code: "RUN_TRANSACTION_MULTI_SOURCE_WARNING", sku });
    }
  }

  for (const [sku, n] of recordCountBySku) {
    if (n > 1) {
      warnings.push({ code: "RUN_TRANSACTION_MULTI_SOURCE_WARNING", sku });
    }
  }

  if (executions.length > 1) {
    warnings.push({ code: "RUN_TRANSACTION_MULTI_SOURCE_WARNING" });
  }

  const snapshotKeysBySku = new Map<string, Set<string>>();
  for (const r of records) {
    const sku = String(r.sku);
    const k = snapshotKey(r.marketSnapshot);
    let set = snapshotKeysBySku.get(sku);
    if (set === undefined) {
      set = new Set<string>();
      snapshotKeysBySku.set(sku, set);
    }
    set.add(k);
  }

  const warnedEpid = new Set<string>();
  const warnedSnapshot = new Set<string>();
  const warnedPrice = new Set<string>();
  const warnedProfit = new Set<string>();

  for (const r of records) {
    const sku = String(r.sku);
    const decision = r.listingDecision;
    const canonicalBinding = input.canonicalBindingBySku?.[sku];
    const canonicalEpid = normEpid(canonicalBinding?.canonicalEpid ?? "EPID_UNRESOLVED");
    const canonicalMissing = canonicalBinding === undefined;
    const canonicalUnresolved =
      canonicalEpid.length === 0 || canonicalEpid === "EPID_UNRESOLVED";

    if (canonicalUnresolved) {
      unresolvedSkuCount += 1;
      if (!warnedEpid.has(sku)) {
        warnings.push({ code: "EPID_UNRESOLVED_WARNING", sku });
        warnedEpid.add(sku);
      }
    } else {
      epidsResolvedCount += 1;
    }

    if (externalIndexed !== null) {
      const ext = externalIndexed.map.get(sku);
      if (ext !== undefined && decisionsConflict(decision, ext)) {
        warnings.push({ code: "RUN_TRANSACTION_MULTI_SOURCE_WARNING", sku });
      }
    }

    const execRows = collectRowsForSku(executions, sku);
    if (execRows.length > 1) {
      warnings.push({ code: "RUN_TRANSACTION_MULTI_SOURCE_WARNING", sku });
    }

    const epidSources: string[] = [
      normEpid(r.epid),
      normEpid(decision.epid),
      ...execRows.flatMap((row) => {
        if (row.success !== undefined) {
          return [itemEpid(row.success.item), normEpid(row.success.ebayPayload.sourceMetadata.epid)];
        }
        if (row.failed !== undefined) {
          return [itemEpid(row.failed.item), normEpid(row.failed.ebayPayload.sourceMetadata.epid)];
        }
        return [];
      }),
    ];
    const nonCanonicalDrift = epidSources.some(
      (ep) => ep.length > 0 && ep !== "EPID_UNRESOLVED" && ep !== canonicalEpid
    );
    if (nonCanonicalDrift) {
      warnings.push({ code: "EPID_CRITICAL_MISMATCH", sku });
      epidDriftCount += 1;
    } else if (!canonicalUnresolved) {
      const hasCanonicalInRows = epidSources.some((ep) => ep === canonicalEpid);
      if (!hasCanonicalInRows && !warnedEpid.has(`${sku}:drift`)) {
        warnings.push({ code: "EPID_DRIFT_WARNING", sku });
        warnedEpid.add(`${sku}:drift`);
        epidDriftCount += 1;
      }
    }

    if (
      canonicalMissing &&
      !canonicalUnresolved &&
      (normEpid(r.epid) !== "EPID_UNRESOLVED" || normEpid(decision.epid) !== "EPID_UNRESOLVED")
    ) {
      warnings.push({ code: "EPID_CRITICAL_MISMATCH", sku });
    }

    const canonicalSnapshot = canonicalBinding?.canonicalSnapshot ?? null;
    if (canonicalSnapshot !== null) {
      const canonicalKey = snapshotKey(canonicalSnapshot);
      const snapSet = snapshotKeysBySku.get(sku);
      const hasSnapshotDrift =
        snapSet !== undefined && [...snapSet].some((k) => k !== canonicalKey);
      if (hasSnapshotDrift && !warnedSnapshot.has(sku)) {
        warnings.push({ code: "MARKET_SNAPSHOT_DRIFT_WARNING", sku });
        warnedSnapshot.add(sku);
        snapshotDriftCount += 1;
      }
    }

    const pm = r.profitModel;
    if (
      !warnedProfit.has(sku) &&
      (!nearlyEqualMoney(pm.recommendedPrice, decision.recommendedPrice) ||
        !nearlyEqualMoney(pm.minProfitablePrice, decision.minAcceptablePrice) ||
        !nearlyEqualMoney(pm.estimatedProfit, decision.metadata.estimatedProfit))
    ) {
      warnings.push({ code: "PROFIT_MODEL_DIVERGENCE_WARNING", sku });
      warnedProfit.add(sku);
    }

    const payload = firstEbayPayload(execRows);
    if (payload !== undefined) {
      const listPrice = extractExecutionListPrice(payload);
      if (
        listPrice !== undefined &&
        !nearlyEqualMoney(listPrice, decision.recommendedPrice) &&
        !warnedPrice.has(sku)
      ) {
        warnings.push({ code: "EXECUTION_PRICE_NON_AUTHORITATIVE_FLAG", sku });
        warnedPrice.add(sku);
        priceMismatches += 1;
      }
    }
  }

  const uniqueSkusCount = uniqueSkus.size;

  return {
    isCompliant: warnings.length === 0,
    warnings,
    summary: {
      totalSkus: uniqueSkusCount,
      epidDriftCount,
      snapshotDriftCount,
      priceMismatches,
      unresolvedSkuCount,
      epidsResolvedCount,
    },
  };
}
