"""Listing copy fallbacks when Claude (or upstream) is unavailable."""

from __future__ import annotations


def platform_string_to_short(platform: str) -> str:
    """
    Map free-text platform (from manifest identity) to eBay title token.
    """
    p = (platform or "").strip().lower()
    if not p:
        return "Video Game"
    if "gamecube" in p or p in ("gc", "gcn"):
        return "GCN"
    if "nintendo 64" in p or p == "n64" or " n64" in p:
        return "N64"
    if "playstation 3" in p or "ps3" in p:
        return "PS3"
    if "playstation 2" in p or "ps2" in p:
        return "PS2"
    if "playstation 1" in p or "ps1" in p or p == "playstation":
        return "PS1"
    if "playstation" in p:
        return "PS1"
    if "xbox 360" in p or ("360" in p and "xbox" in p):
        return "Xbox 360"
    if "xbox" in p:
        return "Xbox"
    return platform.strip()[:20] if platform.strip() else "Video Game"


def get_fallback_ebay_title(game_title: str, platform: str) -> str:
    """Title when Claude is unavailable: ``{title} {platform_short} Disc Only`` (≤80 chars)."""
    t = (game_title or "Unknown Title").strip()
    short = platform_string_to_short(platform)
    base = f"{t} {short} Disc Only"
    return base[:80].rstrip()


def get_disc_only_description(game_title: str, platform: str) -> str:
    """
    Short factual description when Claude is unavailable (two sentences).
    No replacement / loose / DVD wording.
    """
    t = (game_title or "This title").strip()
    plat = (platform or "the listed platform").strip()
    return (
        f"This listing is for the authentic game disc only for {t} ({plat}); it does not include a case, "
        "artwork, or manual, and shows normal used wear. "
        "It ships the same business day in a protective padded mailer."
    )
