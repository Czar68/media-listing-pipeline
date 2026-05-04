"""Shared Gemini / Google AI Studio environment checks for broker workers."""

from __future__ import annotations

import logging
import os

from core.logic.domain_config import normalize_gemini_model_id

_LOGGER = logging.getLogger(__name__)


def require_google_api_key(component: str) -> str:
    """
    Return a stripped GOOGLE_API_KEY or raise after logging CRITICAL.

    ``component`` is included in logs for attribution (e.g. ``identity_worker``).
    """
    key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not key:
        _LOGGER.critical("CRITICAL: Missing API Key (%s)", component)
        raise RuntimeError("CRITICAL: Missing API Key")
    return key


def get_gemini_model_name(fallback: str) -> str:
    """Prefer GEMINI_MODEL (set per-service in docker-compose); otherwise *fallback*, normalised."""
    m = os.getenv("GEMINI_MODEL", "").strip()
    raw = m if m else fallback
    return normalize_gemini_model_id(raw)
