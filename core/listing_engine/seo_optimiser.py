def generate_ebay_title(title: str, season_volume: str = "", disc_info: str = "") -> str:
    """
    Generates an 80-character optimized eBay title for a replacement loose DVD disc.
    Format: [TITLE] [SEASON/VOLUME] [DISC NUMBER] - Replacement Loose DVD Disc
    """
    # Clean inputs
    t = title.strip() if title else "Unknown Title"
    s = f" {season_volume.strip()}" if season_volume else ""
    d = f" {disc_info.strip()}" if disc_info else ""
    
    suffix = " - Replacement Loose DVD Disc"
    
    # Construct base title
    base = f"{t}{s}{d}"
    
    # Truncate base if it exceeds the limit minus the suffix length
    max_base_len = 80 - len(suffix)
    if len(base) > max_base_len:
        base = base[:max_base_len].strip()
        
    return f"{base}{suffix}"
