import type { RunBatchWithTraceResult } from "../runBatch";
import { runBatch } from "../runBatch";
import { MediaAdapterImpl } from "../mediaAdapter";
import { scanBatchRawItems, type ScanBatchOptions } from "../scanner";
import type { NormalizedInventoryItem } from "../types";
import {
  createTraceEvent,
  type ExecutionTrace,
  type ExecutionTraceEvent,
} from "../executionTrace";
import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import type { ListingStrategy, StrategySelectionContext } from "./listingStrategyTypes";
import type { ListingQualityScore } from "../validation/validationScoringTypes";
import { applyStrategyToItems, selectListingStrategy } from "./listingStrategyEngine";
import { createListingDecision, type PricingContext, type ListingDecision } from "../pricing/listingDecisionEngine";

export interface StrategyAwareRunResult extends RunBatchWithTraceResult {
  /** Deterministic, sorted by SKU: chosen strategy per inventory row (pre-execution). */
  readonly strategiesBySku: readonly {
    readonly sku: string;
    readonly strategy: ListingStrategy;
  }[];
  /** Deterministic, sorted by SKU: pricing decisions from ListingDecisionEngine. */
  readonly listingDecisionsBySku: readonly {
    readonly sku: string;
    readonly decision: ListingDecision;
  }[];
  /** Same orchestration trace as {@link runBatch}, with `TRACE_STRATEGY` events appended. */
  readonly trace: ExecutionTrace;
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

/**
 * Pre-executes strategy selection (same normalize path as `runBatch`), injects strategy metadata
 * into raw items, then calls {@link runBatch}. Appends `TRACE_STRATEGY` events to the returned trace.
 */
export async function strategyAwareRun(
  items: readonly unknown[],
  scanOptions?: ScanBatchOptions,
  context?: StrategySelectionContext
): Promise<StrategyAwareRunResult> {
  const adapter = new MediaAdapterImpl();
  const rawResults = scanBatchRawItems(items, scanOptions);
  const normalized: NormalizedInventoryItem[] = rawResults.map((r) => adapter.normalize(r));

  const strategies: ListingStrategy[] = normalized.map((item) =>
    selectListingStrategy({
      item,
      enriched: pickEnrichedForSku(item.sku, context),
      listingQualityScore: pickQualityScoreForSku(item.sku, context),
    })
  );

  const preparedItems = applyStrategyToItems(items, strategies);

  const batchResult = await runBatch(preparedItems, scanOptions);

  const strategiesBySku = strategies
    .map((strategy, i) => ({
      sku: String(normalized[i]?.sku ?? ""),
      strategy,
    }))
    .filter((row) => row.sku.length > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku, "en"));

  // Generate listing decisions using ListingDecisionEngine
  const listingDecisionsBySku = normalized
    .map((item) => {
      const pricingContext: PricingContext = {
        strategyId: strategiesBySku.find(s => s.sku === item.sku)?.strategy.strategyId || "unknown",
        strategyType: strategiesBySku.find(s => s.sku === item.sku)?.strategy.executionConfig.listingMode || "balanced",
      };
      const decision = createListingDecision(item, pricingContext);
      return {
        sku: item.sku,
        decision,
      };
    })
    .filter((row) => row.sku.length > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku, "en"));

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
    listingDecisionsBySku,
  };
}
