def get_disc_only_description(title: str) -> str:
    """
    Generates a standard eBay description for 'Disc Only' media.
    Enforces constraints: Authentic, Loose Disc, Untested/Scratched Surface.
    """
    return (
        f"Item: {title}\n\n"
        "Condition Details:\n"
        "- Authentic original release\n"
        "- Loose Disc (Disc Only - No Case, No Artwork, No Manual)\n"
        "- Condition: Untested/Scratched Surface (may require resurfacing)\n\n"
        "Please note this item is sold as a replacement disc and is visually graded. "
        "Will ship securely packaged to prevent further damage."
    )
