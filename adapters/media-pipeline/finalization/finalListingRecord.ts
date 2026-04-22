import type { ExecutionResult, ExecutionFailed, ExecutionSuccess } from "../execution/types";
import type { ExecutionTrace } from "../executionTrace";
import type { ListingDecision } from "../pricing/listingDecisionEngine";
import type { MarketPricingSnapshot } from "../pricing/marketPricingEngine";
import type { ProfitPricingModel } from "../pricing/profitPricingModel";
import type { ListingStrategy } from "../strategy/listingStrategyTypes";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Deterministic market snapshot when no EPID market pull is used (or as fallback when snapshot is null).
 * Matches {@link MarketPricingSnapshot} shape for {@link buildFinalListingRecord}.
 */
export function buildFallbackMarketSnapshotFromDecision(
  decision: ListingDecision
): MarketPricingSnapshot {
  const median = decision.recommendedPrice;
  return {
    epid: decision.epid ?? "",
    medianPrice: round2(median),
    lowPrice: round2(decision.minAcceptablePrice),
    highPrice: round2(Math.max(median, decision.minAcceptablePrice) * 1.12),
    sampleSize: 0,
    confidence: decision.confidence,
  };
}

/**
 * Canonical system-of-record for one SKU in a listing run: pricing, strategy id, market/profit
 * context, execution outcome, and orchestration identity.
 */
export interface FinalListingRecord {
  readonly sku: string;
  /** Empty string when no catalog match. */
  readonly epid: string;
  readonly strategyId: string;
  readonly listingDecision: ListingDecision;
  readonly marketSnapshot: {
    readonly medianPrice: number;
    readonly sampleSize: number;
    readonly confidence: number;
  };
  readonly profitModel: {
    readonly recommendedPrice: number;
    readonly minProfitablePrice: number;
    readonly estimatedProfit: number;
  };
  readonly executionResult: {
    readonly status: "success" | "failed";
    /** Present when executor reported recovery for this SKU. */
    readonly recovered?: boolean;
    readonly listingId?: string;
    readonly response?: { readonly status?: number; readonly data?: unknown };
    readonly error?: {
      readonly type: string;
      readonly message: string;
      readonly code?: string | number;
    };
  };
  readonly traceRunId: string;
  readonly timestamp: string;
}

export interface BuildFinalListingRecordParams {
  readonly listingDecision: ListingDecision;
  /** Execution-time strategy (same run as the decision); retained for audit and future fields. */
  readonly listingStrategy: ListingStrategy;
  /** Canonical EPID for the run-bound SKU (single-source for persistence). */
  readonly canonicalEpid?: string;
  readonly marketSnapshot: MarketPricingSnapshot;
  readonly profitModel: ProfitPricingModel;
  readonly executionResult: ExecutionResult;
  readonly trace: Pick<ExecutionTrace, "runId">;
  readonly timestamp?: string;
}

function findExecutionForSku(
  execution: ExecutionResult,
  sku: string
): { readonly success?: ExecutionSuccess; readonly failed?: ExecutionFailed } {
  const success = execution.success.find((s) => String(s.item.sku) === sku);
  if (success !== undefined) {
    return { success };
  }
  const failed = execution.failed.find((f) => String(f.item.sku) === sku);
  if (failed !== undefined) {
    return { failed };
  }
  return {};
}

function executionSliceFromRow(
  row: { success?: ExecutionSuccess; failed?: ExecutionFailed },
  extractListingId: (response: { status?: number; data?: unknown }) => string | undefined
): FinalListingRecord["executionResult"] {
  if (row.success !== undefined) {
    return {
      status: "success",
      ...(row.success.recovered === true ? { recovered: true } : {}),
      listingId: extractListingId(row.success.response),
      response: {
        status: row.success.response.status,
        data: row.success.response.data,
      },
    };
  }
  if (row.failed !== undefined) {
    return {
      status: "failed",
      ...(row.failed.recovered === true ? { recovered: true } : {}),
      error: {
        type: row.failed.error.type,
        message: row.failed.error.message,
        ...(row.failed.error.code !== undefined ? { code: row.failed.error.code } : {}),
      },
    };
  }
  return {
    status: "failed",
    error: {
      type: "UNKNOWN",
      message: "No execution row found for SKU",
    },
  };
}

/**
 * Merges pricing, execution batch results, market/profit snapshots, and trace identity into one record.
 * Deterministic aside from optional `timestamp` (defaults to now ISO).
 */
export function buildFinalListingRecord(
  params: BuildFinalListingRecordParams,
  options?: { readonly extractListingId?: typeof defaultExtractListingId }
): FinalListingRecord {
  const {
    listingDecision,
    listingStrategy,
    marketSnapshot,
    profitModel,
    executionResult,
    trace,
    timestamp = new Date().toISOString(),
  } = params;
  void listingStrategy;

  const extractListingId = options?.extractListingId ?? defaultExtractListingId;
  const row = findExecutionForSku(executionResult, listingDecision.sku);
  const executionSlice = executionSliceFromRow(row, extractListingId);

  return {
    sku: listingDecision.sku,
    epid: params.canonicalEpid !== undefined ? String(params.canonicalEpid).trim() : listingDecision.epid ?? "",
    strategyId: listingDecision.strategyId,
    listingDecision,
    marketSnapshot: {
      medianPrice: marketSnapshot.medianPrice,
      sampleSize: marketSnapshot.sampleSize,
      confidence: marketSnapshot.confidence,
    },
    profitModel: {
      recommendedPrice: profitModel.recommendedPrice,
      minProfitablePrice: profitModel.minProfitablePrice,
      estimatedProfit: profitModel.estimatedProfit,
    },
    executionResult: executionSlice,
    traceRunId: trace.runId,
    timestamp,
  };
}

function defaultExtractListingId(response: {
  status?: number;
  data?: unknown;
}): string | undefined {
  if (response.data && typeof response.data === "object") {
    const data = response.data as Record<string, unknown>;
    const listingId =
      (data.listingId as string) ||
      (data.listing_id as string) ||
      (data.itemId as string) ||
      (data.item_id as string) ||
      (data.inventoryItemId as string) ||
      (data.inventory_item_id as string);
    if (listingId && typeof listingId === "string") {
      return listingId;
    }
  }
  return undefined;
}

/**
 * Builds {@link ProfitPricingModel} fields from a listing decision (same numeric contract as
 * {@link ../pricing/profitPricingModel.buildProfitPricingModel} output embedded in the decision path).
 */
export function profitPricingModelFromListingDecision(
  decision: ListingDecision
): ProfitPricingModel {
  return {
    recommendedPrice: decision.recommendedPrice,
    minProfitablePrice: decision.minAcceptablePrice,
    estimatedFees: decision.metadata.estimatedFees,
    estimatedProfit: decision.metadata.estimatedProfit,
  };
}
