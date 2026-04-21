import type { NormalizedInventoryItem } from '../types';
import type { EpidEnrichedInventoryItem } from '../epidEnricher';

/**
 * Core pricing decision structure
 * Represents the recommended pricing for a single inventory item
 */
export interface ListingDecision {
  sku: string;
  epid?: string;
  strategyId: string;
  recommendedPrice: number;
  minAcceptablePrice: number;
  confidence: number;
  metadata: {
    adjustmentFactor: number;
    source: 'epid' | 'fallback';
  };
}

/**
 * Context for pricing decision
 * Includes strategy information and any additional pricing context
 */
export interface PricingContext {
  strategyId: string;
  strategyType: 'aggressive' | 'balanced' | 'safe';
  basePrice?: number;
  currency?: string;
}

/**
 * Strategy-specific pricing configuration
 * Defines adjustment factors and confidence modifiers per strategy
 */
interface StrategyPricingConfig {
  basePrice: number;
  adjustmentFactor: number;
  confidenceModifier: number;
}

/**
 * Strategy pricing configurations
 * Aggressive: higher prices, higher confidence boost
 * Balanced: moderate prices, moderate confidence
 * Safe: lower prices, higher confidence floor
 */
const STRATEGY_CONFIGS: Record<string, StrategyPricingConfig> = {
  aggressive: {
    basePrice: 12.99,
    adjustmentFactor: 1.25,
    confidenceModifier: 0.1,
  },
  balanced: {
    basePrice: 9.99,
    adjustmentFactor: 1.0,
    confidenceModifier: 0.0,
  },
  safe: {
    basePrice: 7.99,
    adjustmentFactor: 0.8,
    confidenceModifier: -0.05,
  },
};

/**
 * EPID-based pricing anchor calculation
 * Stub logic for EPID-based pricing (can be extended with real marketplace data)
 */
function calculateEpidBasedPrice(
  item: EpidEnrichedInventoryItem,
  config: StrategyPricingConfig
): { price: number; confidence: number } {
  // Stub: In a real implementation, this would query marketplace data
  // For now, use base price with EPID confidence boost
  const basePrice = config.basePrice;
  const epidBoost = item.matchConfidence || 0.5;
  const price = basePrice * (1 + epidBoost * 0.2); // Up to 20% boost based on match confidence
  const confidence = 0.6 + epidBoost * 0.3 + config.confidenceModifier;
  
  return {
    price: Math.round(price * 100) / 100, // Round to 2 decimal places
    confidence: Math.min(0.95, Math.max(0.1, confidence)), // Clamp between 0.1 and 0.95
  };
}

/**
 * Fallback pricing calculation for items without EPID
 * Uses deterministic rules based on item characteristics
 */
function calculateFallbackPrice(
  item: NormalizedInventoryItem,
  config: StrategyPricingConfig
): { price: number; confidence: number } {
  // Stub: Use base price with lower confidence for non-EPID items
  const basePrice = config.basePrice;
  const price = basePrice * config.adjustmentFactor;
  const confidence = 0.4 + config.confidenceModifier; // Lower confidence without EPID
  
  return {
    price: Math.round(price * 100) / 100,
    confidence: Math.min(0.85, Math.max(0.1, confidence)),
  };
}

/**
 * Calculate minimum acceptable price based on recommended price
 * Provides a floor for pricing decisions
 */
function calculateMinAcceptablePrice(recommendedPrice: number, strategyType: string): number {
  const floorMultipliers: Record<string, number> = {
    aggressive: 0.7,
    balanced: 0.75,
    safe: 0.8,
  };
  
  const multiplier = floorMultipliers[strategyType] || 0.75;
  return Math.round(recommendedPrice * multiplier * 100) / 100;
}

/**
 * Create a listing decision for an inventory item
 * 
 * @param item - The inventory item (may be EPID-enriched)
 * @param context - Pricing context including strategy information
 * @returns A structured listing decision with pricing recommendations
 */
export function createListingDecision(
  item: NormalizedInventoryItem | EpidEnrichedInventoryItem,
  context: PricingContext
): ListingDecision {
  const config = STRATEGY_CONFIGS[context.strategyType] || STRATEGY_CONFIGS.balanced;
  
  // Check if item has EPID enrichment
  const hasEpid = 'epid' in item && !!item.epid;
  
  let priceResult: { price: number; confidence: number };
  let source: 'epid' | 'fallback';
  
  if (hasEpid) {
    priceResult = calculateEpidBasedPrice(item as EpidEnrichedInventoryItem, config);
    source = 'epid';
  } else {
    priceResult = calculateFallbackPrice(item, config);
    source = 'fallback';
  }
  
  const recommendedPrice = priceResult.price;
  const minAcceptablePrice = calculateMinAcceptablePrice(recommendedPrice, context.strategyType);
  
  return {
    sku: item.sku,
    epid: hasEpid ? (item as EpidEnrichedInventoryItem).epid : undefined,
    strategyId: context.strategyId,
    recommendedPrice,
    minAcceptablePrice,
    confidence: priceResult.confidence,
    metadata: {
      adjustmentFactor: config.adjustmentFactor,
      source,
    },
  };
}

/**
 * Batch create listing decisions for multiple items
 * Maintains order and applies same context to all items
 */
export function createListingDecisions(
  items: (NormalizedInventoryItem | EpidEnrichedInventoryItem)[],
  context: PricingContext
): ListingDecision[] {
  return items.map(item => createListingDecision(item, context));
}
