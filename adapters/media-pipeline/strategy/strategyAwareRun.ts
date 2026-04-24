import type { RunBatchWithTraceResult } from "../runBatch";
import { runBatch } from "../runBatch";
import { MediaAdapterImpl } from "../mediaAdapter";
import type { ListingDecision } from "../pricing/listingDecisionEngine";
import { scanBatchRawItems, type ScanBatchOptions } from "../scanner";
import type { NormalizedInventoryItem } from "../types";
import {
  createTraceEvent,
  type ExecutionTrace,
  type ExecutionTraceEvent,
} from "../executionTrace";
import type { ListingStrategy, StrategySelectionContext } from "./listingStrategyTypes";
import type { ListingQualityScore } from "../validation/validationScoringTypes";
import { applyStrategyToItems, buildListingStrategyAndDecision } from "./listingStrategyEngine";
import { persistListingRecords } from "../persistence/listingStore";
import {
  enrichWithEpid,
  type EpidEnrichedInventoryItem,
} from "../epidEnricher";
import {
  buildFinalListingRecord,
  type FinalListingRecord,
  profitPricingModelFromListingDecision,
} from "../finalization/finalListingRecord";
import { getMarketPricingSnapshot, type MarketPricingSnapshot } from "../pricing/marketPricingEngine";
import {
  validateRunTransactionContractV1,
  type RunTransactionContractValidationResult,
} from "../contracts/runTransactionContractValidator";

/** Temporary: set `MEDIA_PIPELINE_DRY_RUN_TRACE=1` to log canonical → decision → record flow. */
function dryRunTraceEnabled(): boolean {
  return process.env.MEDIA_PIPELINE_DRY_RUN_TRACE === "1";
}

function logDryRunCanonicalBindings(map: ReadonlyMap<string, CanonicalRunBinding>): void {
  if (!dryRunTraceEnabled()) return;
  console.log("[DRY_RUN_EXECUTION_TRACE] --- Canonical bindings ---");
  for (const [sku, b] of map) {
    const snap =
      b.canonicalSnapshot === null
        ? null
        : {
            medianPrice: b.canonicalSnapshot.medianPrice,
            sampleSize: b.canonicalSnapshot.sampleSize,
            confidence: b.canonicalSnapshot.confidence,
          };
    console.log(
      JSON.stringify({
        phase: "canonical_binding",
        sku,
        canonicalEpid: b.canonicalEpid,
        status: b.status,
        canonicalSnapshot: snap,
      })
    );
  }
}

function logDryRunListingDecisions(
  normalized: readonly NormalizedInventoryItem[],
  paired: readonly { decision: ListingDecision }[]
): void {
  if (!dryRunTraceEnabled()) return;
  console.log("[DRY_RUN_EXECUTION_TRACE] --- Listing decisions ---");
  for (let i = 0; i < paired.length; i++) {
    const sku = String(normalized[i]?.sku ?? "");
    const { decision } = paired[i]!;
    console.log(
      JSON.stringify({
        phase: "listing_decision",
        sku,
        recommendedPrice: decision.recommendedPrice,
        epid: decision.epid,
        pricingSource: decision.metadata.source,
      })
    );
  }
}

function logDryRunFinalRecords(records: readonly FinalListingRecord[]): void {
  if (!dryRunTraceEnabled()) return;
  console.log("[DRY_RUN_EXECUTION_TRACE] --- Final records ---");
  for (const rec of records) {
    console.log(
      JSON.stringify({
        phase: "final_record",
        sku: rec.sku,
        epid: rec.epid,
        marketSnapshot: rec.marketSnapshot,
        executionResultStatus: rec.executionResult.status,
      })
    );
  }
}

export interface StrategyAwareRunOptions {
  /**
   * When false, {@link StrategyAwareRunResult.listingDecisionsBySku} is omitted (strategies only).
   * Default true.
   */
  readonly includeListingDecisions?: boolean;
}

export interface StrategyAwareRunResult extends RunBatchWithTraceResult {
  /** Deterministic, sorted by SKU: chosen strategy per inventory row (pre-execution). */
  readonly strategiesBySku: readonly {
    readonly sku: string;
    readonly strategy: ListingStrategy;
  }[];
  /** Present when {@link StrategyAwareRunOptions.includeListingDecisions} is not false. */
  readonly listingDecisionsBySku?: readonly {
    readonly sku: string;
    readonly decision: ListingDecision;
  }[];
  /** Same orchestration trace as {@link runBatch}, with `TRACE_STRATEGY` events appended. */
  readonly trace: ExecutionTrace;
  /** Read-only RUN_TRANSACTION_CONTRACT_V1 diagnostics; does not affect execution or persistence. */
  readonly contractValidation: RunTransactionContractValidationResult;
}

type CanonicalBindingStatus =
  | "RESOLVED"
  | "UNRESOLVED_BLOCKED";

interface CanonicalRunBinding {
  readonly sku: string;
  readonly canonicalEpid: string;
  readonly status: CanonicalBindingStatus;
  readonly canonicalSnapshot: MarketPricingSnapshot | null;
  readonly snapshotStatus: "OK" | "MISSING";
  readonly epidConflict: boolean;
  readonly bindingSource: "context" | "none";
  readonly matchConfidence?: number;
}

function pickQualityScoreForSku(
  sku: string,
  context: StrategySelectionContext | undefined
): ListingQualityScore | undefined {
  if (context?.qualityScoreBySku?.[sku] !== undefined) {
    return context.qualityScoreBySku[sku];
  }
  return context?.defaultQualityScore;
}

function pickEnrichedForSku(
  sku: string,
  context: StrategySelectionContext | undefined
): Partial<EpidEnrichedInventoryItem> | undefined {
  return context?.enrichedBySku?.[sku];
}

async function resolveCanonicalBinding(
  normalized: readonly NormalizedInventoryItem[],
  context: StrategySelectionContext | undefined
): Promise<ReadonlyMap<string, CanonicalRunBinding>> {
  const out = new Map<string, CanonicalRunBinding>();

  /** Non-empty, non-placeholder EPID string, or empty when unusable. */
  function validBoundEpid(raw: unknown): string {
    if (raw === undefined || raw === null) {
      return "";
    }
    const s = String(raw).trim();
    if (s === "" || s === "EPID_UNRESOLVED") {
      return "";
    }
    return s;
  }

  for (const item of normalized) {
    const sku = String(item.sku);
    const contextEnriched = pickEnrichedForSku(sku, context);
    const normalizedWithOptionalEpid = item as NormalizedInventoryItem & Partial<EpidEnrichedInventoryItem>;
    const fromNormalizedField = validBoundEpid(normalizedWithOptionalEpid.epid);
    const meta = item.metadata;
    const fromMetadata =
      meta !== undefined && typeof meta === "object" && meta !== null && !Array.isArray(meta)
        ? validBoundEpid((meta as Record<string, unknown>).epid)
        : "";
    const chosenEpid = fromNormalizedField !== "" ? fromNormalizedField : fromMetadata;

    let enrichedResult: EpidEnrichedInventoryItem | null = null;
    try {
      enrichedResult = await enrichWithEpid(item, { mode: "ingestion" });
    } catch {
      enrichedResult = null;
    }

    const enrichedEpid =
      enrichedResult?.epid !== undefined && String(enrichedResult.epid).trim() !== ""
      && String(enrichedResult.epid).trim() !== "EPID_UNRESOLVED"
        ? String(enrichedResult.epid).trim()
        : "";

    const status: CanonicalBindingStatus =
      chosenEpid !== "" ? "RESOLVED" : "UNRESOLVED_BLOCKED";
    const canonicalEpid = chosenEpid !== "" ? chosenEpid : "EPID_UNRESOLVED";
    const bindingSource: CanonicalRunBinding["bindingSource"] =
      chosenEpid !== "" ? "context" : "none";
    const epidConflict =
      status === "UNRESOLVED_BLOCKED"
        ? enrichedEpid !== ""
        : enrichedEpid !== "" && enrichedEpid !== canonicalEpid;

    let canonicalSnapshot: MarketPricingSnapshot | null = null;
    let snapshotStatus: CanonicalRunBinding["snapshotStatus"] = "MISSING";

    if (status === "RESOLVED") {
      try {
        canonicalSnapshot = await getMarketPricingSnapshot(canonicalEpid);
      } catch {
        canonicalSnapshot = null;
      }
      snapshotStatus = canonicalSnapshot !== null ? "OK" : "MISSING";
    }

    out.set(sku, {
      sku,
      canonicalEpid,
      status,
      canonicalSnapshot,
      snapshotStatus,
      epidConflict,
      bindingSource,
      ...(contextEnriched?.matchConfidence !== undefined
        ? { matchConfidence: contextEnriched.matchConfidence }
        : {}),
    });
  }

  return out;
}

/**
 * Pre-executes strategy selection (same normalize path as `runBatch`), injects strategy metadata
 * into raw items, then calls {@link runBatch}. Appends `TRACE_STRATEGY` events to the returned trace.
 */
export async function strategyAwareRun(
  items: readonly unknown[],
  scanOptions?: ScanBatchOptions,
  context?: StrategySelectionContext,
  options?: StrategyAwareRunOptions
): Promise<StrategyAwareRunResult> {
  const adapter = new MediaAdapterImpl();
  const rawResults = scanBatchRawItems(items, scanOptions);
  const normalized: NormalizedInventoryItem[] = rawResults.map((r) => adapter.normalize(r));
  const canonicalBindingBySku = await resolveCanonicalBinding(normalized, context);
  logDryRunCanonicalBindings(canonicalBindingBySku);

  const includeDecisions = options?.includeListingDecisions !== false;

  const paired = await Promise.all(
    normalized.map(async (item) => {
      const binding = canonicalBindingBySku.get(String(item.sku));
      const { strategy, decision } = await buildListingStrategyAndDecision({
        item,
        enriched: {
          ...pickEnrichedForSku(item.sku, context),
          ...(binding?.status === "RESOLVED" ? { epid: binding.canonicalEpid } : {}),
          ...(binding?.matchConfidence !== undefined
            ? { matchConfidence: binding.matchConfidence }
            : {}),
        },
        listingQualityScore: pickQualityScoreForSku(item.sku, context),
      }, {
        canonicalEpid: binding?.canonicalEpid,
        canonicalSnapshot: binding?.canonicalSnapshot,
      });
      return { strategy, decision };
    })
  );
  logDryRunListingDecisions(normalized, paired);

  const strategies = paired.map((p) => p.strategy);
  const preparedItems = applyStrategyToItems(items, strategies);

  const batchResult = await runBatch(preparedItems, canonicalBindingBySku, scanOptions);

  const timestamp = new Date().toISOString();
  const finalRecords = await Promise.all(
    paired.map(async ({ strategy, decision }) => {
      const binding = canonicalBindingBySku.get(String(decision.sku));
      const marketSnapshot = binding?.canonicalSnapshot ?? null;
      const profitModel = profitPricingModelFromListingDecision(decision);
      return buildFinalListingRecord({
        listingDecision: decision,
        listingStrategy: strategy,
        canonicalEpid: binding?.canonicalEpid ?? "EPID_UNRESOLVED",
        marketSnapshot,
        profitModel,
        executionResult: batchResult.execution,
        trace: batchResult.trace,
        timestamp,
      });
    })
  );
  logDryRunFinalRecords(finalRecords);
  await persistListingRecords({ records: finalRecords });

  const contractValidation = validateRunTransactionContractV1({
    records: finalRecords,
    execution: batchResult.execution,
    canonicalBindingBySku: Object.fromEntries(
      [...canonicalBindingBySku.entries()].map(([sku, binding]) => [
        sku,
        {
          canonicalEpid: binding.canonicalEpid,
          canonicalSnapshot: binding.canonicalSnapshot,
        },
      ])
    ),
  });

  const strategiesBySku = strategies
    .map((strategy, i) => ({
      sku: String(normalized[i]?.sku ?? ""),
      strategy,
    }))
    .filter((row) => row.sku.length > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku, "en"));

  const listingDecisionsBySku = includeDecisions
    ? paired
        .map((p, i) => ({
          sku: String(normalized[i]?.sku ?? ""),
          decision: p.decision,
        }))
        .filter((row) => row.sku.length > 0)
        .sort((a, b) => a.sku.localeCompare(b.sku, "en"))
    : undefined;

  const strategyEvents: ExecutionTraceEvent[] = strategiesBySku.map(({ sku, strategy }) =>
    createTraceEvent("TRACE_STRATEGY", batchResult.trace.runId, {
      sku,
      strategyId: strategy.strategyId,
      listingMode: strategy.executionConfig.listingMode,
      enableEPID: strategy.executionConfig.enableEPID,
      retryPolicy: strategy.executionConfig.retryPolicy,
      basePrice: strategy.pricing.basePrice,
      adjustmentFactor: strategy.pricing.adjustmentFactor,
    })
  );

  const augmentedTrace: ExecutionTrace = {
    ...batchResult.trace,
    events: [...batchResult.trace.events, ...strategyEvents],
  };

  return {
    ...batchResult,
    trace: augmentedTrace,
    strategiesBySku,
    contractValidation,
    ...(listingDecisionsBySku !== undefined ? { listingDecisionsBySku } : {}),
  };
}
