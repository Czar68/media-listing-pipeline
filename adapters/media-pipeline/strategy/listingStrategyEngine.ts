import type { ListingStrategy, ListingStrategyInput } from "./listingStrategyTypes";
import { createListingDecision, type PricingContext } from "../pricing/listingDecisionEngine";

/** Matches mock executor / default listing placeholder used in this repo. */
export const STRATEGY_PLACEHOLDER_BASE_PRICE = 9.99;

export const STRATEGY_SCORE_THRESHOLDS = {
  aggressiveMin: 75,
  balancedMin: 55,
} as const;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function tierFromListingQualityScore(
  finalScore: number | undefined
): "safe" | "balanced" | "aggressive" {
  if (finalScore === undefined) {
    return "balanced";
  }
  if (finalScore >= STRATEGY_SCORE_THRESHOLDS.aggressiveMin) {
    return "aggressive";
  }
  if (finalScore >= STRATEGY_SCORE_THRESHOLDS.balancedMin) {
    return "balanced";
  }
  return "safe";
}

function adjustmentFactorForMode(
  mode: ListingStrategy["executionConfig"]["listingMode"],
  hasEpid: boolean
): number {
  const baseByMode: Record<ListingStrategy["executionConfig"]["listingMode"], number> = {
    aggressive: 1.06,
    balanced: 1,
    safe: 0.94,
  };
  let f: number = baseByMode[mode];
  if (hasEpid) {
    f = round4(Math.min(1.15, f + 0.02));
  }
  return f;
}

function strategyIdFor(mode: ListingStrategy["executionConfig"]["listingMode"]): string {
  return `listing-strategy-${mode}-v1`;
}

/**
 * Deterministic strategy selection from optional {@link ListingQualityScore} and EPID hints.
 * Uses ListingDecisionEngine for pricing decisions instead of hardcoded 9.99.
 */
export function selectListingStrategy(input: ListingStrategyInput): ListingStrategy {
  const mode = tierFromListingQualityScore(input.listingQualityScore?.finalScore);
  const hasEpid =
    input.enriched?.epid !== undefined && String(input.enriched.epid).trim() !== "";

  const adjustmentFactor = adjustmentFactorForMode(mode, hasEpid);

  // Use ListingDecisionEngine for pricing instead of hardcoded 9.99
  const pricingContext: PricingContext = {
    strategyId: strategyIdFor(mode),
    strategyType: mode,
  };
  
  const listingDecision = createListingDecision(input.item, pricingContext);
  const basePrice = round4(listingDecision.recommendedPrice);

  const enableEPID = mode !== "safe";
  const retryPolicy: ListingStrategy["executionConfig"]["retryPolicy"] =
    mode === "safe" ? "strict" : "normal";

  return {
    strategyId: strategyIdFor(mode),
    pricing: {
      basePrice,
      adjustmentFactor,
    },
    executionConfig: {
      enableEPID,
      retryPolicy,
      listingMode: mode,
    },
  };
}

/**
 * Injects {@link ListingStrategy} into each row's `metadata.listingStrategy` before `runBatch`.
 * Returns a new array (does not mutate input objects when cloning is needed).
 */
export function applyStrategyToItems(
  items: readonly unknown[],
  strategyOrPerItem: ListingStrategy | readonly ListingStrategy[]
): unknown[] {
  const perItem = Array.isArray(strategyOrPerItem) ? strategyOrPerItem : null;
  if (perItem !== null) {
    if (perItem.length !== items.length) {
      throw new Error("applyStrategyToItems: strategy array length must match items length");
    }
    return items.map((item, i) => injectStrategyIntoRawItem(item, perItem[i]!));
  }
  const s = strategyOrPerItem as ListingStrategy;
  return items.map((item) => injectStrategyIntoRawItem(item, s));
}

function strategyToRecord(s: ListingStrategy): Record<string, unknown> {
  return {
    strategyId: s.strategyId,
    pricing: { ...s.pricing },
    executionConfig: { ...s.executionConfig },
  };
}

function injectStrategyIntoRawItem(item: unknown, strategy: ListingStrategy): unknown {
  const payload = strategyToRecord(strategy);
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return {
      title: "",
      metadata: { listingStrategy: payload },
    };
  }
  const o = item as Record<string, unknown>;
  const meta =
    typeof o.metadata === "object" && o.metadata !== null && !Array.isArray(o.metadata)
      ? { ...(o.metadata as Record<string, unknown>) }
      : {};
  meta.listingStrategy = payload;
  return { ...o, metadata: meta };
}
