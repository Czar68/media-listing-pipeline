from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from uuid import uuid4

class Manifest(BaseModel):
    transaction_id: str = Field(default_factory=lambda: str(uuid4()))
    status: str = "pending_identity"
    raw_identifier: Optional[str] = None
    image_paths: List[str] = []
    identity: Dict = {"title": None, "artist": None, "format": "DVD", "confidence": 0.0, "metadata_source": "claude-3.5-sonnet"}
    financials: Dict = {"listing_price": 0.0, "ebay_fees": 0.0, "shipping_cost": 0.0, "net_profit": 0.0}
    flags: Dict = {"human_review_required": True, "conflict_detected": False, "is_lot": False}
