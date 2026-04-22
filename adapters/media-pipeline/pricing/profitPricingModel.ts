/**
 * Profit + Fee Model
 * 
 * Ensures pricing decisions are economically valid by calculating fees, profit,
 * and enforcing minimum profitable price floors.
 */

export interface ProfitPricingModel {
  readonly recommendedPrice: number;
  readonly minProfitablePrice: number;
  readonly estimatedFees: number;
  readonly estimatedProfit: number;
}

export interface ProfitPricingInput {
  readonly basePrice: number;
  readonly costBasis?: number;
  readonly strategyAdjustmentFactor: number;
}

/**
 * eBay fee configuration (deterministic constants).
 * Future: Make configurable per marketplace or account tier.
 */
const FEE_RATE = 0.13; // 13% eBay fee
const FIXED_FEE = 0.30; // $0.30 fixed fee
const MINIMUM_PROFIT_BUFFER = 1.00; // $1 minimum profit

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Builds a profit-aware pricing model from base price and cost basis.
 * 
 * Logic:
 * - estimatedFees = (basePrice * feeRate) + fixedFee
 * - minProfitablePrice: costBasis + fees + $1 buffer, or 85% of basePrice if no costBasis
 * - recommendedPrice: basePrice * strategyAdjustmentFactor, clamped to minProfitablePrice
 * - estimatedProfit: recommendedPrice - fees - costBasis
 * 
 * @param input - Base price, optional cost basis, and strategy adjustment factor
 * @returns ProfitPricingModel with economically validated pricing
 */
export function buildProfitPricingModel(
  input: ProfitPricingInput
): ProfitPricingModel {
  const { basePrice, costBasis, strategyAdjustmentFactor } = input;

  // Calculate estimated fees
  const estimatedFees = round2(basePrice * FEE_RATE + FIXED_FEE);

  // Calculate minimum profitable price
  let minProfitablePrice: number;
  if (costBasis !== undefined && costBasis > 0) {
    minProfitablePrice = round2(costBasis + estimatedFees + MINIMUM_PROFIT_BUFFER);
  } else {
    // Fallback safety floor when cost basis is unknown
    minProfitablePrice = round2(basePrice * 0.85);
  }

  // Calculate recommended price with strategy influence
  const strategyAdjustedPrice = round2(basePrice * strategyAdjustmentFactor);
  const recommendedPrice = Math.max(strategyAdjustedPrice, minProfitablePrice);

  // Calculate estimated profit
  const actualCostBasis = costBasis ?? 0;
  const estimatedProfit = round2(recommendedPrice - estimatedFees - actualCostBasis);

  return {
    recommendedPrice,
    minProfitablePrice,
    estimatedFees,
    estimatedProfit,
  };
}
