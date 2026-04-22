import type { ListingStrategy, ListingStrategyInput } from "./listingStrategyTypes";
import type { ListingDecision, PricingContext } from "../pricing/listingDecisionEngine";
import type { MarketPricingSnapshot } from "../pricing/marketPricingEngine";
import { LISTING_DECISION_BASE_REFERENCE, createListingDecision } from "../pricing/listingDecisionEngine";

/** @deprecated Use {@link LISTING_DECISION_BASE_REFERENCE} from listingDecisionEngine. */
export const STRATEGY_PLACEHOLDER_BASE_PRICE = LISTING_DECISION_BASE_REFERENCE;

export const STRATEGY_SCORE_THRESHOLDS = {
  aggressiveMin: 75,
  balancedMin: 55,
} as const;

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

function strategyIdFor(mode: ListingStrategy["executionConfig"]["listingMode"]): string {
  return `listing-strategy-${mode}-v1`;
}

function pricingContextFromInput(
  mode: ListingStrategy["executionConfig"]["listingMode"],
  enriched: ListingStrategyInput["enriched"],
  canonical?: {
    readonly canonicalEpid?: string;
    readonly canonicalSnapshot?: MarketPricingSnapshot | null;
  }
): PricingContext {
  const canonicalEpid =
    canonical?.canonicalEpid !== undefined && String(canonical.canonicalEpid).trim() !== ""
      ? String(canonical.canonicalEpid).trim()
      : undefined;
  const epid =
    canonicalEpid !== undefined
      ? canonicalEpid
      : enriched?.epid !== undefined && String(enriched.epid).trim() !== ""
      ? String(enriched.epid).trim()
      : undefined;
  return {
    strategyId: strategyIdFor(mode),
    strategyType: mode,
    ...(epid !== undefined ? { epid } : {}),
    ...(canonicalEpid !== undefined ? { canonicalEpid } : {}),
    ...(canonical?.canonicalSnapshot !== undefined
      ? { canonicalSnapshot: canonical.canonicalSnapshot }
      : {}),
    ...(enriched?.matchConfidence !== undefined
      ? { matchConfidence: enriched.matchConfidence }
      : {}),
  };
}

/**
 * Single pass: {@link createListingDecision} + {@link ListingStrategy} (execution knobs).
 */
export async function buildListingStrategyAndDecision(
  input: ListingStrategyInput,
  canonical?: {
    readonly canonicalEpid?: string;
    readonly canonicalSnapshot?: MarketPricingSnapshot | null;
  }
): Promise<{ readonly strategy: ListingStrategy; readonly decision: ListingDecision }> {
  const mode = tierFromListingQualityScore(input.listingQualityScore?.finalScore);
  const ctx = pricingContextFromInput(mode, input.enriched, canonical);
  const decision = await createListingDecision(input.item, ctx);

  const enableEPID = mode !== "safe";
  const retryPolicy: ListingStrategy["executionConfig"]["retryPolicy"] =
    mode === "safe" ? "strict" : "normal";

  const strategy: ListingStrategy = {
    strategyId: decision.strategyId,
    pricing: {
      basePrice: decision.recommendedPrice,
      adjustmentFactor: decision.metadata.adjustmentFactor,
    },
    executionConfig: {
      enableEPID,
      retryPolicy,
      listingMode: mode,
    },
  };

  return { strategy, decision };
}

/**
 * Deterministic strategy selection; pricing comes from {@link createListingDecision} only.
 */
export async function selectListingStrategy(input: ListingStrategyInput): Promise<ListingStrategy> {
  const result = await buildListingStrategyAndDecision(input);
  return result.strategy;
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
