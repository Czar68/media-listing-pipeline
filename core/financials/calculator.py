from decimal import Decimal, ROUND_HALF_UP

# Covers Zone 8 Ground Advantage for <4oz packages to ensure no loss on cross-country shipments.
LIGHTWEIGHT_GROUND_ADVANTAGE_USD = 4.95

# Per-unit cost basis (loose disc pipeline) — used when manifest omits explicit values.
DEFAULT_ACQUISITION_USD = 1.00
DEFAULT_PACKAGING_USD = 0.25


def calculate_ebay_fees(listing_price: float) -> float:
    """Calculates eBay fees: 14.95% of gross + $0.30."""
    price = Decimal(str(listing_price))
    rate = Decimal('0.1495')
    fixed_fee = Decimal('0.30')
    fees = (price * rate) + fixed_fee
    return float(fees.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def calculate_financials(
    listing_price: float,
    acquisition_cost: float = DEFAULT_ACQUISITION_USD,
    packaging_cost: float = DEFAULT_PACKAGING_USD,
) -> dict:
    """
    Deterministically calculates financial metrics for a listing.

    Shipping is a single USPS **Ground Advantage** lightweight parcel tier for this
    pipeline (standard merchandising mail). No multi-lb weight-class ladder.
    """
    shipping_cost = LIGHTWEIGHT_GROUND_ADVANTAGE_USD
    acq = float(acquisition_cost)
    pack = float(packaging_cost)

    if listing_price <= 0:
        net_loss = (
            Decimal("0.0")
            - Decimal(str(shipping_cost))
            - Decimal(str(acq))
            - Decimal(str(pack))
        )
        return {
            "listing_price": listing_price,
            "ebay_fees": 0.0,
            "shipping_cost": shipping_cost,
            "acquisition_cost": acq,
            "packaging_cost": pack,
            "net_profit": float(net_loss.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        }

    ebay_fees = calculate_ebay_fees(listing_price)

    p = Decimal(str(listing_price))
    f = Decimal(str(ebay_fees))
    s = Decimal(str(shipping_cost))
    a = Decimal(str(acq))
    k = Decimal(str(pack))
    net = p - f - s - a - k
    net_profit = float(net.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    return {
        "listing_price": listing_price,
        "ebay_fees": ebay_fees,
        "shipping_cost": shipping_cost,
        "acquisition_cost": acq,
        "packaging_cost": pack,
        "net_profit": net_profit,
    }
