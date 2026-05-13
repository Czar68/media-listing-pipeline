"""
AI-driven multi-disc detection on a single raw scan (Claude Vision primary, Gemini fallback + Pillow crops).

Bounding boxes from the model use [ymin, xmin, ymax, xmax] in one of:
  • normalized 0–1 fractions of image height (y) and width (x), or
  • 0–1000 scale (Gemini-style proportional coordinates).

Output crops are normalised to **1000×1000** JPEGs (white canvas, disc centred).
There is **no** multi-lb shipping / weight-class logic in this module — identification only.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import sys
from typing import Any

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ai_broker.gemini_env import get_gemini_model_name, require_google_api_key
from core.logic.domain_config import get_domain_config, normalize_gemini_model_id

_LOGGER = logging.getLogger(__name__)

CLAUDE_MULTIDISC_MODEL = "claude-haiku-4-5-20251001"


class VisionAllProvidersFailed(RuntimeError):
    """Raised when Claude vision fails and the Gemini fallback also fails."""

    def __init__(self, claude_exc: BaseException | None, gemini_exc: BaseException) -> None:
        self.claude_exc = claude_exc
        self.gemini_exc = gemini_exc
        super().__init__(f"Multi-disc vision failed after Claude and Gemini: {gemini_exc!r}")


def _resolve_model_id(explicit: str | None) -> str:
    cfg = get_domain_config()
    if explicit and str(explicit).strip():
        return normalize_gemini_model_id(str(explicit).strip())
    return get_gemini_model_name(cfg["ocr_model"])


MULTI_DISC_VISION_PROMPT = """You are an expert optical media cataloguer for video game discs.

Analyse the ENTIRE image. Identify individual game discs visible (partial discs count if the label area is visible).
Return **at most 3** discs — the three clearest / most complete if more appear in frame.

Return ONLY valid JSON (no markdown fences) with exactly this shape:
{
  "discs": [
    {
      "title": "Best readable game title from the label, or empty string if unknown",
      "serial_number": "Platform serial on the disc ring/label (e.g. SLUS-20974, BLUS-30132) or empty string if illegible",
      "platform": "Console family (e.g. PlayStation 2, Xbox 360) inferred from serial/artwork, or empty string",
      "bounding_box": [ymin, xmin, ymax, xmax]
    }
  ]
}

bounding_box rules (critical):
  • ymin, ymax are vertical positions as a fraction of FULL image HEIGHT (0.0 = top, 1.0 = bottom).
  • xmin, xmax are horizontal positions as a fraction of FULL image WIDTH (0.0 = left, 1.0 = right).
  • Use inclusive corners; ensure ymin < ymax and xmin < xmax.
  • Tighten the box around each disc label/hub area (not the whole photo).

If no discs are visible, return {"discs": []}.
"""


def _extract_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _discs_list_from_vision_text_claude(text: str) -> list[dict[str, Any]]:
    if not text:
        raise RuntimeError("Multi-disc vision returned empty text (Claude).")

    data = _extract_json_object(text)
    if not data or "discs" not in data:
        raise RuntimeError("Multi-disc vision response was not valid JSON with a 'discs' array (Claude).")

    discs = data["discs"]
    if not isinstance(discs, list):
        raise RuntimeError("'discs' must be a JSON array.")

    out: list[dict[str, Any]] = []
    for i, d in enumerate(discs):
        if not isinstance(d, dict):
            continue
        box = d.get("bounding_box")
        if not isinstance(box, list) or len(box) != 4:
            _LOGGER.warning("Skipping disc %d: invalid bounding_box %r", i, box)
            continue
        try:
            yn, xn, yx, xx = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "title": (d.get("title") or "").strip(),
                "serial_number": (d.get("serial_number") or "").strip(),
                "platform": (d.get("platform") or "").strip(),
                "bounding_box": [yn, xn, yx, xx],
            }
        )
    return out[:3]


def _build_multidisc_user_prompt() -> str:
    cfg = get_domain_config()
    ocr_prompt = cfg["ocr_prompt"]
    return (
        f"{ocr_prompt}\n\n"
        "---\n\n"
        "Apply the instructions above when reading label and ring text. "
        "For this same full-frame image, also perform multi-disc detection and layout as follows:\n\n"
        f"{MULTI_DISC_VISION_PROMPT}"
    )


def _detect_discs_with_claude(image_path: str) -> list[dict[str, Any]]:
    api_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set.")

    try:
        from anthropic import Anthropic
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"Anthropic / Pillow dependencies missing: {exc}") from exc

    try:
        img = Image.open(image_path).convert("RGB")
    except OSError as exc:
        raise RuntimeError(f"Could not open image: {exc}") from exc

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")

    user_prompt = _build_multidisc_user_prompt()
    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=CLAUDE_MULTIDISC_MODEL,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": user_prompt},
                ],
            }
        ],
    )

    text_parts: list[str] = []
    for block in message.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)
    text = "".join(text_parts).strip()

    return _discs_list_from_vision_text_claude(text)


def _detect_discs_with_gemini(image_path: str, *, model_id: str | None = None) -> list[dict[str, Any]]:
    """
    Original Gemini-only multi-disc path (unchanged behaviour).
    """
    if not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    api_key = require_google_api_key("disc_detection")
    mid = _resolve_model_id(model_id)

    try:
        from google import genai
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"Gemini / Pillow dependencies missing: {exc}") from exc

    try:
        img = Image.open(image_path).convert("RGB")
    except OSError as exc:
        raise RuntimeError(f"Could not open image: {exc}") from exc

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model=mid,
            contents=[MULTI_DISC_VISION_PROMPT, img],
        )
    except Exception as exc:
        _LOGGER.exception("Multi-disc Gemini request failed (model=%s)", mid)
        raise RuntimeError(f"Multi-disc vision API failed: {exc}") from exc

    text = (getattr(response, "text", None) or "").strip()
    if not text:
        raise RuntimeError("Multi-disc vision returned empty text.")

    data = _extract_json_object(text)
    if not data or "discs" not in data:
        raise RuntimeError("Multi-disc vision response was not valid JSON with a 'discs' array.")

    discs = data["discs"]
    if not isinstance(discs, list):
        raise RuntimeError("'discs' must be a JSON array.")

    out: list[dict[str, Any]] = []
    for i, d in enumerate(discs):
        if not isinstance(d, dict):
            continue
        box = d.get("bounding_box")
        if not isinstance(box, list) or len(box) != 4:
            _LOGGER.warning("Skipping disc %d: invalid bounding_box %r", i, box)
            continue
        try:
            yn, xn, yx, xx = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "title": (d.get("title") or "").strip(),
                "serial_number": (d.get("serial_number") or "").strip(),
                "platform": (d.get("platform") or "").strip(),
                "bounding_box": [yn, xn, yx, xx],
            }
        )
    return out[:3]


def detect_discs_in_image(image_path: str, *, model_id: str | None = None) -> list[dict[str, Any]]:
    """
    Run vision on the full *image_path* and return a list of disc dicts
    (title, serial_number, platform, bounding_box).

    Primary: Claude Haiku vision (ANTHROPIC_API_KEY), using ``domain_config`` OCR prompt
    plus the multi-disc JSON schema. Fallback: existing Gemini call (same as before),
    only if the Claude path raises.
    """
    if not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    claude_exc: BaseException | None = None
    try:
        return _detect_discs_with_claude(image_path)
    except Exception as exc:
        claude_exc = exc
        _LOGGER.warning(
            "Multi-disc Claude vision failed; falling back to Gemini (%s)",
            exc,
        )

    try:
        return _detect_discs_with_gemini(image_path, model_id=model_id)
    except Exception as gemini_exc:
        _LOGGER.error(
            "Multi-disc Gemini fallback failed after Claude failure (claude=%r gemini=%r)",
            claude_exc,
            gemini_exc,
        )
        raise VisionAllProvidersFailed(claude_exc, gemini_exc) from gemini_exc


def _bbox_to_pixels(
    ymin: float,
    xmin: float,
    ymax: float,
    xmax: float,
    w: int,
    h: int,
) -> tuple[int, int, int, int]:
    """Convert model box to pixel crop (left, upper, right, lower), clamped."""
    mx = max(ymin, xmin, ymax, xmax)

    if mx <= 1.0 + 1e-6:
        y0, x0, y1, x1 = ymin * h, xmin * w, ymax * h, xmax * w
    elif mx <= 1000.0 + 1e-6:
        y0 = ymin * h / 1000.0
        x0 = xmin * w / 1000.0
        y1 = ymax * h / 1000.0
        x1 = xmax * w / 1000.0
    else:
        y0, x0, y1, x1 = ymin, xmin, ymax, xmax

    if y0 > y1:
        y0, y1 = y1, y0
    if x0 > x1:
        x0, x1 = x1, x0

    left = int(max(0, min(w - 1, x0)))
    upper = int(max(0, min(h - 1, y0)))
    right = int(max(left + 1, min(w, x1)))
    lower = int(max(upper + 1, min(h, y1)))
    return left, upper, right, lower


def smart_crop_disc_with_circular_mask(
    source_image_path: str,
    bounding_box: list[float],
    output_path: str,
    *,
    output_size: int = 1000,
) -> None:
    """
    Crop the region from the full image, apply a circular mask (disc-only look),
    scale and centre on a ``output_size`` × ``output_size`` white canvas, and save
    a high-quality JPEG to *output_path*.
    """
    from PIL import Image, ImageDraw

    if len(bounding_box) != 4:
        raise ValueError("bounding_box must have four numbers [ymin, xmin, ymax, xmax]")

    img = Image.open(source_image_path).convert("RGB")
    w, h = img.size
    left, upper, right, lower = _bbox_to_pixels(*bounding_box, w, h)

    rect = img.crop((left, upper, right, lower)).convert("RGBA")
    rw, rh = rect.size
    if rw < 4 or rh < 4:
        raise ValueError("Crop region too small after clamping.")

    cx, cy = rw // 2, rh // 2
    r = int(min(rw, rh) * 0.46)
    r = max(4, min(r, min(rw, rh) // 2 - 1))

    mask = Image.new("L", (rw, rh), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    rect.putalpha(mask)

    disc_rgb = Image.new("RGB", (rw, rh), (255, 255, 255))
    disc_rgb.paste(rect, mask=mask)

    margin = 40
    inner = max(1, output_size - 2 * margin)
    scale = min(inner / rw, inner / rh)
    nw = max(1, int(round(rw * scale)))
    nh = max(1, int(round(rh * scale)))
    scaled = disc_rgb.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (output_size, output_size), (255, 255, 255))
    ox = (output_size - nw) // 2
    oy = (output_size - nh) // 2
    canvas.paste(scaled, (ox, oy))

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    canvas.save(output_path, quality=95, optimize=True)
    _LOGGER.info("Saved %dx%d smart crop: %s", output_size, output_size, output_path)
