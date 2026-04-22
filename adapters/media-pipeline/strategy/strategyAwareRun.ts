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
  buildFallbackMarketSnapshotFromDecision,
  profitPricingModelFromListingDecision,
} from "../finalization/finalListingRecord";
import { getMarketPricingSnapshot, type MarketPricingSnapshot } from "../pricing/marketPricingEngine";
import {
  validateRunTransactionContractV1,
  type RunTransactionContractValidationResult,
} from "../contracts/runTransactionContractValidator";

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

interface CanonicalRunBinding {
  readonly sku: string;
  readonly canonicalEpid: string;
  readonly canonicalSnapshot: MarketPricingSnapshot | null;
  readonly snapshotStatus: "OK" | "MISSING";
  readonly epidConflict: boolean;
  readonly bindingSource: "context" | "enrichment" | "none";
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

  for (const item of normalized) {
    const sku = String(item.sku);
    const contextEnriched = pickEnrichedForSku(sku, context);
    const normalizedWithOptionalEpid = item as NormalizedInventoryItem & Partial<EpidEnrichedInventoryItem>;
    const normalizedEpid =
      normalizedWithOptionalEpid.epid !== undefined &&
      String(normalizedWithOptionalEpid.epid).trim() !== "" &&
      String(normalizedWithOptionalEpid.epid).trim() !== "EPID_UNRESOLVED"
        ? String(normalizedWithOptionalEpid.epid).trim()
        : "";

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

    const canonicalEpid = normalizedEpid !== "" ? normalizedEpid : "EPID_UNRESOLVED";
    const bindingSource: CanonicalRunBinding["bindingSource"] =
      normalizedEpid !== "" ? "context" : "none";
    const epidConflict =
      canonicalEpid === "EPID_UNRESOLVED" ||
      (enrichedEpid !== "" && enrichedEpid !== canonicalEpid);

    let canonicalSnapshot: MarketPricingSnapshot | null = null;
    let snapshotStatus: CanonicalRunBinding["snapshotStatus"] = "MISSING";

    if (canonicalEpid !== "EPID_UNRESOLVED") {
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
      canonicalSnapshot,
      snapshotStatus,
      epidConflict,
      bindingSource,
      ...(contextEnriched?.matchConfidence !== undefined
        ? { matchConfidence: contextEnriched.matchConfidence }
        : enrichedResult?.matchConfidence !== undefined
          ? { matchConfidence: enrichedResult.matchConfidence }
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

  const includeDecisions = options?.includeListingDecisions !== false;

  const paired = await Promise.all(
    normalized.map(async (item) => {
      const binding = canonicalBindingBySku.get(String(item.sku));
      const { strategy, decision } = await buildListingStrategyAndDecision({
        item,
        enriched: {
          ...pickEnrichedForSku(item.sku, context),
          ...(binding?.canonicalEpid !== undefined && binding.canonicalEpid !== ""
            ? { epid: binding.canonicalEpid }
            : {}),
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

  const strategies = paired.map((p) => p.strategy);
  const preparedItems = applyStrategyToItems(items, strategies);

  const batchResult = await runBatch(preparedItems, scanOptions);

  const timestamp = new Date().toISOString();
  const finalRecords = await Promise.all(
    paired.map(async ({ strategy, decision }) => {
      const binding = canonicalBindingBySku.get(String(decision.sku));
      const marketSnapshot = binding?.canonicalSnapshot ?? buildFallbackMarketSnapshotFromDecision(decision);
      const profitModel = profitPricingModelFromListingDecision(decision);
      return buildFinalListingRecord({
        listingDecision: decision,
        listingStrategy: strategy,
        canonicalEpid: binding?.canonicalEpid ?? "",
        marketSnapshot,
        profitModel,
        executionResult: batchResult.execution,
        trace: batchResult.trace,
        timestamp,
      });
    })
  );
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
