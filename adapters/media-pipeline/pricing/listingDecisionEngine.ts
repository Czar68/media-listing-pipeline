import type { NormalizedInventoryItem } from "../types";
import type { MarketPricingSnapshot } from "./marketPricingEngine";
import { buildProfitPricingModel } from "./profitPricingModel";

/**
 * Nominal reference for reporting {@link ListingDecision.metadata.adjustmentFactor}
 * as recommendedPrice / BASE_REFERENCE (design-time anchor, not a marketplace price).
 */
export const LISTING_DECISION_BASE_REFERENCE = 10;

export interface ListingDecision {
  readonly sku: string;
  readonly epid?: string;
  readonly strategyId: string;
  readonly recommendedPrice: number;
  readonly minAcceptablePrice: number;
  /** 0–1, deterministic from EPID presence, match quality, and strategy tier. */
  readonly confidence: number;
  readonly metadata: {
    readonly adjustmentFactor: number;
    readonly source: "epid_market" | "fallback";
    readonly epidStatus?: "RESOLVED" | "UNRESOLVED";
    readonly estimatedFees: number;
    readonly estimatedProfit: number;
  };
}

export interface PricingContext {
  readonly strategyId: string;
  readonly strategyType: "aggressive" | "balanced" | "safe";
  /** Observability-only; not used for authoritative EPID selection. */
  readonly epid?: string;
  /**
   * When the strategy layer has EPID hints (e.g. from {@link StrategySelectionContext.enrichedBySku}),
   * EPID-based anchor pricing is used. Omitted or empty → fallback model.
   */
  readonly canonicalEpid?: string;
  readonly canonicalSnapshot?: MarketPricingSnapshot | null;
  readonly matchConfidence?: number;
  /**
   * Optional cost basis for profit calculations.
   * If provided, ensures pricing is above cost + fees + minimum profit buffer.
   */
  readonly costBasis?: number;
}

interface TierAnchors {
  readonly anchor: number;
  readonly priceMultiplier: number;
  readonly confidenceOffset: number;
}

/**
 * Strategy tier shifts recommended price and confidence (deterministic, no I/O).
 * aggressive → higher anchor; safe → lower; balanced → midpoint.
 */
const STRATEGY_TIERS: Record<PricingContext["strategyType"], TierAnchors> = {
  aggressive: { anchor: 14.5, priceMultiplier: 1.08, confidenceOffset: 0.12 },
  balanced: { anchor: 10.25, priceMultiplier: 1, confidenceOffset: 0 },
  safe: { anchor: 7.25, priceMultiplier: 0.92, confidenceOffset: -0.1 },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Deterministic 0–1 jitter from string (stable across runs). */
function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10001) / 10000;
}

/**
 * Stub: EPID string implies catalog alignment; spread price slightly by hashed epid suffix.
 * Replace with marketplace comps when economics are wired in.
 */
function epidAnchorComponent(epid: string): number {
  const spread = hash01(epid) * 2.5;
  return spread;
}

/**
 * Fallback uses title + sku for deterministic micro-variation (no EPID).
 */
function fallbackAnchorComponent(item: NormalizedInventoryItem): number {
  return hash01(`${item.sku}|${item.title}`) * 1.75;
}

function clampConfidence(c: number): number {
  return round4(Math.min(0.97, Math.max(0.08, c)));
}

/**
 * Builds {@link ListingDecision} from normalized inventory + strategy context.
 * EPID path uses canonical market pricing snapshot as anchor when provided.
 */
export async function createListingDecision(
  item: NormalizedInventoryItem,
  context: PricingContext
): Promise<ListingDecision> {
  const tier = STRATEGY_TIERS[context.strategyType] ?? STRATEGY_TIERS.balanced;
  const canonicalEpid = context.canonicalEpid !== undefined ? String(context.canonicalEpid).trim() : "";
  const isUnresolved = canonicalEpid.length === 0 || canonicalEpid === "EPID_UNRESOLVED";
  const epid = isUnresolved ? "EPID_UNRESOLVED" : canonicalEpid;
  const hasEpid = !isUnresolved;

  const matchConf =
    context.matchConfidence !== undefined && Number.isFinite(context.matchConfidence)
      ? clamp01(context.matchConfidence)
      : hasEpid
        ? 0.55
        : 0;

  let recommendedPrice: number;
  let confidence: number;
  let source: ListingDecision["metadata"]["source"];

  let basePrice: number;
  let strategyAdjustmentFactor: number;

  if (hasEpid) {
    source = "epid_market";
    const marketSnapshot = context.canonicalSnapshot ?? null;
    
    if (marketSnapshot) {
      // Use market median as base anchor
      basePrice = marketSnapshot.medianPrice;
      confidence = clampConfidence(
        marketSnapshot.confidence + matchConf * 0.2 + tier.confidenceOffset
      );
    } else {
      // Fallback to stub if market snapshot fails
      const anchor = tier.anchor + epidAnchorComponent(epid);
      basePrice = anchor * tier.priceMultiplier;
      confidence = clampConfidence(
        0.52 + matchConf * 0.38 + tier.confidenceOffset + 0.08
      );
    }
    // Apply EPID quality boost to strategy adjustment
    const epidQualityBoost = 1 + matchConf * 0.06;
    strategyAdjustmentFactor = tier.priceMultiplier * epidQualityBoost;
  } else {
    source = "fallback";
    const anchor = tier.anchor + fallbackAnchorComponent(item);
    basePrice = anchor * tier.priceMultiplier;
    strategyAdjustmentFactor = tier.priceMultiplier;
    confidence = clampConfidence(0.38 + tier.confidenceOffset - 0.12);
  }

  // Build profit-aware pricing model
  const profitModel = buildProfitPricingModel({
    basePrice,
    costBasis: context.costBasis,
    strategyAdjustmentFactor,
  });

  recommendedPrice = profitModel.recommendedPrice;
  const minAcceptablePrice = profitModel.minProfitablePrice;

  const adjustmentFactor = round4(recommendedPrice / LISTING_DECISION_BASE_REFERENCE);

  return {
    sku: item.sku,
    epid,
    strategyId: isUnresolved ? "NO_EPID_STRATEGY" : context.strategyId,
    recommendedPrice,
    minAcceptablePrice,
    confidence,
    metadata: {
      adjustmentFactor,
      source,
      epidStatus: isUnresolved ? "UNRESOLVED" : "RESOLVED",
      estimatedFees: profitModel.estimatedFees,
      estimatedProfit: profitModel.estimatedProfit,
    },
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
