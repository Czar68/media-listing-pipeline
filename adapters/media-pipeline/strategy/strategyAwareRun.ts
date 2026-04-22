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
import type { EpidEnrichedInventoryItem } from "../epidEnricher";
import type { ListingStrategy, StrategySelectionContext } from "./listingStrategyTypes";
import type { ListingQualityScore } from "../validation/validationScoringTypes";
import { applyStrategyToItems, buildListingStrategyAndDecision } from "./listingStrategyEngine";

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
  context?: StrategySelectionContext,
  options?: StrategyAwareRunOptions
): Promise<StrategyAwareRunResult> {
  const adapter = new MediaAdapterImpl();
  const rawResults = scanBatchRawItems(items, scanOptions);
  const normalized: NormalizedInventoryItem[] = rawResults.map((r) => adapter.normalize(r));

  const includeDecisions = options?.includeListingDecisions !== false;

  const paired = await Promise.all(
    normalized.map(async (item) => {
      const { strategy, decision } = await buildListingStrategyAndDecision({
        item,
        enriched: pickEnrichedForSku(item.sku, context),
        listingQualityScore: pickQualityScoreForSku(item.sku, context),
      });
      return { strategy, decision };
    })
  );

  const strategies = paired.map((p) => p.strategy);
  const preparedItems = applyStrategyToItems(items, strategies);

  const batchResult = await runBatch(preparedItems, scanOptions);

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
    ...(listingDecisionsBySku !== undefined ? { listingDecisionsBySku } : {}),
  };
}
