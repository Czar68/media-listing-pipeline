from decimal import Decimal, ROUND_HALF_UP

def calculate_ebay_fees(listing_price: float) -> float:
    """Calculates eBay fees: 14.95% of gross + $0.30."""
    price = Decimal(str(listing_price))
    rate = Decimal('0.1495')
    fixed_fee = Decimal('0.30')
    fees = (price * rate) + fixed_fee
    return float(fees.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def calculate_financials(listing_price: float, acquisition_cost: float = 0.0) -> dict:
    """
    Deterministically calculates financial metrics for a listing.
    """
    shipping_cost = 4.25
    
    if listing_price <= 0:
        return {
            "listing_price": listing_price,
            "ebay_fees": 0.0,
            "shipping_cost": shipping_cost,
            "acquisition_cost": acquisition_cost,
            "net_profit": float(Decimal('0.0') - Decimal(str(shipping_cost)) - Decimal(str(acquisition_cost)))
        }
        
    ebay_fees = calculate_ebay_fees(listing_price)
    
    # Calculate net profit
    p = Decimal(str(listing_price))
    f = Decimal(str(ebay_fees))
    s = Decimal(str(shipping_cost))
    a = Decimal(str(acquisition_cost))
    net = p - f - s - a
    net_profit = float(net.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
    
    return {
        "listing_price": listing_price,
        "ebay_fees": ebay_fees,
        "shipping_cost": shipping_cost,
        "acquisition_cost": acquisition_cost,
        "net_profit": net_profit
    }
