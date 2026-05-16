export interface BestOfferConfig {
  readonly listPrice: number;
  readonly acquisitionCost: number;
  readonly shippingCost: number;
  readonly adRatePercent: number;
  readonly ebayFeeRate: number;
  readonly ebayFixedFee: number;
}

export interface BestOfferResult {
  readonly enabled: boolean;
  readonly floorPrice: number | null;
  readonly autoAcceptPrice: number | null;
  readonly autoDeclinePrice: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const DISABLED: BestOfferResult = {
  enabled: false,
  floorPrice: null,
  autoAcceptPrice: null,
  autoDeclinePrice: null,
};

export function buildBestOffer(config: BestOfferConfig): BestOfferResult {
  const { listPrice, acquisitionCost, shippingCost, adRatePercent, ebayFeeRate, ebayFixedFee } = config;

  if (listPrice < 15) {
    return DISABLED;
  }

  const ebayFees = round2((listPrice * ebayFeeRate) + ebayFixedFee);
  const adCost = round2(listPrice * (adRatePercent / 100));
  let floorPrice = round2(acquisitionCost + ebayFees + shippingCost + adCost);

  // Clamp floor: at least 40% of list price
  const minFloor = round2(listPrice * 0.4);
  if (floorPrice < minFloor) {
    floorPrice = minFloor;
  }

  // Clamp floor: must be less than list price (cap at 95%)
  const maxFloor = round2(listPrice * 0.95);
  if (floorPrice >= listPrice) {
    floorPrice = maxFloor;
  }

  const autoAcceptPrice = round2((floorPrice + listPrice) / 2);
  const autoDeclinePrice = round2(floorPrice * 0.99);

  // Safety invariant checks:
  // autoDeclinePrice must be strictly less than floorPrice
  // autoAcceptPrice must be strictly greater than floorPrice and strictly less than listPrice
  if (
    autoDeclinePrice >= floorPrice ||
    autoAcceptPrice <= floorPrice ||
    autoAcceptPrice >= listPrice
  ) {
    return DISABLED;
  }

  return {
    enabled: true,
    floorPrice,
    autoAcceptPrice,
    autoDeclinePrice,
  };
}
