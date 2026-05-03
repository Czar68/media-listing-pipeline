import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.logic.domain_config import get_domain_config


class DiscScanner:
    def __init__(self):
        """
        Initialise the DiscScanner using the active domain configuration.

        Model selection:
          - OCR / visual identification → gemini-3-flash  (high-volume, cost-efficient)
          - Domain prompt is injected from domain_config so no rebuild is needed when
            switching between MOVIES and GAMES via the ACTIVE_DOMAIN env var.
        """
        config = get_domain_config()
        self.ai_model = config["ocr_model"]          # gemini-3-flash
        self.prompt = config["ocr_prompt"]
        self.domain = config["domain"]
        self.identifier_label = config["identifier_label"]

        print(f" [DiscScanner] Initialised — model: {self.ai_model} | domain: {self.domain}")

    def analyze_image(self, image_path: str) -> dict:
        """
        Simulates calling the Gemini Flash vision API with the domain-specific prompt.
        Returns a normalised dict keyed by 'hub_code' (MOVIES) or 'platform_code' (GAMES),
        plus shared keys: copyright_text, confidence.
        """
        print(f" [AI/{self.ai_model}] Prompting: '{self.prompt[:80]}...'")
        print(f" [AI/{self.ai_model}] Analyzing image: {image_path}")

        # Derive a deterministic mock identifier from the filename
        filename = image_path.replace("\\", "/").split("/")[-1]
        raw_id = filename.split(".")[0] if "." in filename else "BVDL-123456"

        if self.domain == "GAMES":
            # Simulate a platform code extraction (SLUS format for PS2 NTSC-U)
            platform_code = raw_id if raw_id.startswith(("SLUS", "BLUS", "NUSA", "SLES", "BLES")) else f"SLUS-{raw_id[:5]}"
            return {
                "hub_code": platform_code,          # canonical key used by identity_worker
                "platform_code": platform_code,
                "region": "NTSC-U",
                "rating": "T",
                "publisher": "Mocked Publisher",
                "copyright_text": "(C) Mocked Copyright",
                "confidence": 0.91,
            }
        else:
            # MOVIES — Hub Code path
            return {
                "hub_code": raw_id,
                "studio": "Mocked Studio",
                "season_volume": "",
                "copyright_text": "(C) Mocked Copyright",
                "confidence": 0.92,
            }
