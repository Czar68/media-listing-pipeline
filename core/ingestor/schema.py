from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from uuid import uuid4


def game_identity_template() -> Dict[str, Any]:
    """Default identity envelope for the GAMES / triple-disc pipeline (no movie-specific fields)."""
    return {
        "title": None,
        "title_hint": None,
        "platform": None,
        "platform_code": None,
        "publisher": None,
        "region": None,
        "rating": None,
        "upc": None,
        "format": "Game Disc",
        "confidence": 0.0,
        "metadata_source": "gemini-1.5-flash",
    }


class Manifest(BaseModel):
    transaction_id: str = Field(default_factory=lambda: str(uuid4()))
    status: str = "pending_identity"
    raw_identifier: Optional[str] = None
    image_paths: List[str] = []
    identity: Dict[str, Any] = Field(default_factory=game_identity_template)
    financials: Dict = {
        "listing_price": 0.0,
        "ebay_fees": 0.0,
        "shipping_cost": 0.0,
        "acquisition_cost": 1.0,
        "packaging_cost": 0.25,
        "net_profit": 0.0,
    }
    flags: Dict = {"human_review_required": True, "conflict_detected": False, "is_lot": False}
