import json
import logging
import os
import re
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ai_broker.gemini_env import get_gemini_model_name, require_google_api_key
from core.logic.domain_config import get_domain_config

_LOGGER = logging.getLogger(__name__)


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


class DiscScanner:
    def __init__(self):
        """
        Forensic OCR via Gemini (Google Gen AI SDK). Model id from GEMINI_MODEL
        or domain_config ocr_model, normalised (no ``models/models/...``).
        """
        config = get_domain_config()
        self.ai_model = get_gemini_model_name(config["ocr_model"])
        self.prompt = config["ocr_prompt"]
        self.domain = config["domain"]
        self.identifier_label = config["identifier_label"]

        print(f" [DiscScanner] Initialised — model: {self.ai_model} | domain: {self.domain}")

    def _analyze_with_gemini(self, image_path: str, *, api_key: str) -> dict:
        try:
            from google import genai
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError(f"Gemini OCR dependencies missing: {exc}") from exc

        try:
            img = Image.open(image_path).convert("RGB")
        except OSError as exc:
            raise RuntimeError(f"Could not open image: {exc}") from exc

        full_prompt = (
            f"{self.prompt}\n\n"
            "Respond with ONLY a single JSON object and no other text or markdown."
        )

        client = genai.Client(api_key=api_key)
        try:
            response = client.models.generate_content(
                model=self.ai_model,
                contents=[full_prompt, img],
            )
        except Exception as exc:
            _LOGGER.exception(
                "Gemini OCR API request failed (model=%s path=%s)",
                self.ai_model,
                image_path,
            )
            raise RuntimeError(f"Gemini OCR API failed: {exc}") from exc

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            _LOGGER.error(
                "Gemini OCR returned empty text (model=%s path=%s); refusing mock data.",
                self.ai_model,
                image_path,
            )
            raise RuntimeError("Gemini OCR returned empty or blocked response.")

        parsed = _extract_json_object(text)
        if not parsed:
            _LOGGER.error(
                "Gemini OCR response was not valid JSON (model=%s). First 200 chars: %r",
                self.ai_model,
                text[:200],
            )
            raise RuntimeError("Gemini OCR response was not valid JSON.")

        if self.domain == "GAMES":
            pc = parsed.get("platform_code") or parsed.get("hub_code")
            if pc:
                parsed["hub_code"] = pc
            return parsed

        hc = parsed.get("hub_code")
        if hc:
            parsed["hub_code"] = hc
        return parsed

    def analyze_image(self, image_path: str) -> dict:
        """
        Run Gemini vision on *image_path*. Requires GOOGLE_API_KEY.
        API failures raise RuntimeError — no mock OCR that could poison downstream queues.
        """
        api_key = require_google_api_key("DiscScanner")

        try:
            parsed = self._analyze_with_gemini(image_path, api_key=api_key)
        except RuntimeError:
            raise
        except Exception as exc:
            _LOGGER.exception("DiscScanner: unexpected failure on %s", image_path)
            raise RuntimeError(f"DiscScanner failure: {exc}") from exc

        if parsed.get("confidence") is None:
            parsed["confidence"] = 0.88

        print(f" [AI/{self.ai_model}] Gemini vision OK for {image_path}")
        return parsed
