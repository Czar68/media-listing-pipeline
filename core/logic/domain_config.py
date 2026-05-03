"""
domain_config.py — Multi-domain routing for the media listing pipeline.

Reads ACTIVE_DOMAIN from the environment (.env injected via docker-compose env_file).
Supported values: MOVIES (default) | GAMES

Workers import `get_domain_config()` on startup; no rebuild needed to switch domains.
"""

import os
from typing import TypedDict


class DomainConfig(TypedDict):
    domain: str
    ocr_model: str
    ocr_prompt: str
    listing_model: str
    identifier_label: str  # Human-readable label for the primary identifier


# ── MOVIES ────────────────────────────────────────────────────────────────────
_MOVIES_CONFIG: DomainConfig = {
    "domain": "MOVIES",
    "ocr_model": "gemini-3-flash",
    "ocr_prompt": (
        "You are a forensic disc analyst specialising in DVD and Blu-ray media. "
        "Analyse the inner-ring area of the provided disc image. "
        "Extract the following fields with high precision:\n"
        "  • Hub Code / Matrix Code (e.g. BVDL-123456, WB-DVD-007)\n"
        "  • Studio or Label (e.g. Warner Bros, Disney, Sony Pictures)\n"
        "  • Season or Volume number if visible (e.g. Season 3, Vol 2)\n"
        "  • Copyright text\n"
        "Return a JSON object with keys: hub_code, studio, season_volume, copyright_text, confidence."
    ),
    "listing_model": "claude-3-5-sonnet-20240620",
    "identifier_label": "Hub Code",
}

# ── GAMES ─────────────────────────────────────────────────────────────────────
_GAMES_CONFIG: DomainConfig = {
    "domain": "GAMES",
    "ocr_model": "gemini-3-flash",
    "ocr_prompt": (
        "You are a forensic disc analyst specialising in PlayStation, Xbox, and Nintendo optical media. "
        "Analyse the disc label and inner-ring area of the provided image. "
        "Extract the following fields with high precision:\n"
        "  • Platform Code — the disc serial number identifying the game and platform "
        "(e.g. SLUS-12345 for PS2 NTSC-U, BLUS-30001 for PS3, NUSA-12345 for Xbox NTSC-U, "
        "SLES for PS2 PAL, BLES for PS3 PAL)\n"
        "  • Region — NTSC-U, NTSC-J, or PAL\n"
        "  • ESRB / PEGI Rating visible on the label (e.g. T, M, E10+)\n"
        "  • Publisher or Studio if visible\n"
        "  • Copyright text\n"
        "Return a JSON object with keys: platform_code, region, rating, publisher, copyright_text, confidence."
    ),
    "listing_model": "claude-3-5-sonnet-20240620",
    "identifier_label": "Platform Code",
}

_DOMAIN_MAP = {
    "MOVIES": _MOVIES_CONFIG,
    "GAMES": _GAMES_CONFIG,
}


def get_domain_config() -> DomainConfig:
    """
    Returns the domain configuration for the active domain.
    Reads ACTIVE_DOMAIN from the environment; defaults to MOVIES.
    """
    domain = os.getenv("ACTIVE_DOMAIN", "MOVIES").upper().strip()
    config = _DOMAIN_MAP.get(domain)
    if config is None:
        print(f" [DomainConfig] WARNING: Unknown domain '{domain}'. Falling back to MOVIES.")
        config = _MOVIES_CONFIG
    print(f" [DomainConfig] Active domain: {config['domain']} | OCR model: {config['ocr_model']}")
    return config
