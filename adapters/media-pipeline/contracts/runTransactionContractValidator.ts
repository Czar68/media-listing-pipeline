import type { EbayInventoryItem } from "../ebayMapper";
import type { FinalListingRecord } from "../finalization/finalListingRecord";
import type { ListingDecision } from "../pricing/listingDecisionEngine";
import type { ExecutionFailed, ExecutionResult, ExecutionSuccess } from "../execution/types";
import type { EpidEnrichedInventoryItem } from "../epidEnricher";

const PRICE_EPS = 0.005;

export type ContractWarningCode =
  | "CANONICAL_BINDING_INPUT_MISSING"
  | "CANONICAL_BINDING_SKU_MISSING"
  | "EPID_CRITICAL_MISMATCH"
  | "EPID_UNRESOLVED_WARNING"
  | "MARKET_SNAPSHOT_DRIFT_WARNING"
  | "EXECUTION_PRICE_NON_AUTHORITATIVE_FLAG"
  | "PROFIT_MODEL_DIVERGENCE_WARNING";

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

type SnapshotSlice = NonNullable<FinalListingRecord["marketSnapshot"]>;

export interface ValidateRunTransactionContractV1Input {
  readonly records: readonly FinalListingRecord[];
  /**
   * @deprecated Ignored; contract validation is canonical-binding-only.
   */
  readonly listingDecisions?: readonly ListingDecision[];
  readonly execution: ExecutionResult | readonly ExecutionResult[];
  readonly canonicalBindingBySku: Readonly<
    Record<
      string,
      {
        readonly canonicalEpid: string;
        readonly canonicalSnapshot: FinalListingRecord["marketSnapshot"];
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

function normalizeObservedEpid(raw: string | undefined): string {
  const n = normEpid(raw);
  return n === "" ? "EPID_UNRESOLVED" : n;
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

function snapshotKey(s: SnapshotSlice): string {
  return `${s.medianPrice}|${s.sampleSize}|${s.confidence}`;
}

function snapshotsEqual(
  a: FinalListingRecord["marketSnapshot"],
  b: FinalListingRecord["marketSnapshot"]
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return snapshotKey(a) === snapshotKey(b);
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

function isEpidObservationAllowed(observedRaw: string | undefined, canonicalNorm: string): boolean {
  const o = normalizeObservedEpid(observedRaw);
  if (o === "EPID_UNRESOLVED") return true;
  return o === canonicalNorm;
}

/**
 * Read-only diagnostics for RUN_TRANSACTION_CONTRACT_V1. Compares records and execution rows
 * strictly against {@link ValidateRunTransactionContractV1Input.canonicalBindingBySku} only.
 */
export function validateRunTransactionContractV1(
  input: ValidateRunTransactionContractV1Input
): RunTransactionContractValidationResult {
  const warnings: ContractWarning[] = [];
  const executions = normalizeExecutions(input.execution);
  const records = input.records;

  const emptySummary = (): RunTransactionContractValidationSummary => ({
    totalSkus: 0,
    epidDriftCount: 0,
    snapshotDriftCount: 0,
    priceMismatches: 0,
    unresolvedSkuCount: 0,
    epidsResolvedCount: 0,
  });

  if (input.canonicalBindingBySku === undefined || input.canonicalBindingBySku === null) {
    return {
      isCompliant: false,
      warnings: [{ code: "CANONICAL_BINDING_INPUT_MISSING" }],
      summary: emptySummary(),
    };
  }

  let epidDriftCount = 0;
  let snapshotDriftCount = 0;
  let priceMismatches = 0;
  let unresolvedSkuCount = 0;
  let epidsResolvedCount = 0;

  const uniqueSkus = new Set(records.map((r) => String(r.sku)));
  const uniqueSkusCount = uniqueSkus.size;

  const warnedEpid = new Set<string>();
  const warnedSnapshot = new Set<string>();
  const warnedPrice = new Set<string>();
  const warnedProfit = new Set<string>();
  const warnedBindingSku = new Set<string>();

  for (const r of records) {
    const sku = String(r.sku);
    const decision = r.listingDecision;
    const binding = input.canonicalBindingBySku[sku];

    if (binding === undefined) {
      if (!warnedBindingSku.has(sku)) {
        warnings.push({ code: "CANONICAL_BINDING_SKU_MISSING", sku });
        warnedBindingSku.add(sku);
      }
      continue;
    }

    const canonicalNorm = normalizeObservedEpid(binding.canonicalEpid);
    const canonicalUnresolved = canonicalNorm === "EPID_UNRESOLVED";

    if (canonicalUnresolved) {
      unresolvedSkuCount += 1;
      if (!warnedEpid.has(sku)) {
        warnings.push({ code: "EPID_UNRESOLVED_WARNING", sku });
        warnedEpid.add(sku);
      }
    } else {
      epidsResolvedCount += 1;
    }

    const execRows = collectRowsForSku(executions, sku);
    const observedEpids: (string | undefined)[] = [
      r.epid,
      decision.epid,
      ...execRows.flatMap((row) => {
        if (row.success !== undefined) {
          return [
            itemEpid(row.success.item),
            normEpid(row.success.ebayPayload.sourceMetadata.epid),
          ];
        }
        if (row.failed !== undefined) {
          return [
            itemEpid(row.failed.item),
            normEpid(row.failed.ebayPayload.sourceMetadata.epid),
          ];
        }
        return [];
      }),
    ];

    const epidMismatch = observedEpids.some((raw) => !isEpidObservationAllowed(raw, canonicalNorm));
    if (epidMismatch && !warnedEpid.has(`${sku}:mismatch`)) {
      warnings.push({ code: "EPID_CRITICAL_MISMATCH", sku });
      warnedEpid.add(`${sku}:mismatch`);
      epidDriftCount += 1;
    }

    const canonicalSnapshot = binding.canonicalSnapshot;
    if (!snapshotsEqual(r.marketSnapshot, canonicalSnapshot)) {
      if (!warnedSnapshot.has(sku)) {
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
