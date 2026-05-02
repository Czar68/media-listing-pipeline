def calculate_ebay_fees(listing_price: float) -> float:
    """Calculates eBay fees: 14.95% of gross + $0.30."""
    return round((listing_price * 0.1495) + 0.30, 2)

def calculate_financials(listing_price: float, acquisition_cost: float = 0.0) -> dict:
    """
    Deterministically calculates financial metrics for a listing.
    
    Args:
        listing_price (float): The intended listing price.
        acquisition_cost (float): The cost to acquire the item.
        
    Returns:
        dict: Updated financial metrics.
    """
    shipping_cost = 4.25  # Standardized for "Disc Only" media
    
    if listing_price <= 0:
        return {
            "listing_price": listing_price,
            "ebay_fees": 0.0,
            "shipping_cost": shipping_cost,
            "acquisition_cost": acquisition_cost,
            "net_profit": round(0.0 - shipping_cost - acquisition_cost, 2)
        }
        
    ebay_fees = calculate_ebay_fees(listing_price)
    net_profit = round(listing_price - ebay_fees - shipping_cost - acquisition_cost, 2)
    
    return {
        "listing_price": listing_price,
        "ebay_fees": ebay_fees,
        "shipping_cost": shipping_cost,
        "acquisition_cost": acquisition_cost,
        "net_profit": net_profit
    }
