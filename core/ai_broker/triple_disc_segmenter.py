"""
Triple-disc capture: split one photo into three equal rectangular crops with Pillow.

- Landscape / square (width >= height): three **vertical** strips (equal width slices).
- Portrait (height > width): three **horizontal** strips (equal height slices).

Crops are written to data/storage/processed/ for the pipeline.
Optional JPEG copies named *crop* under data/drafts/ for quick local debugging
(see identity_worker callers).
"""

from __future__ import annotations

import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

_PROCESSED_SUBDIR = ("data", "storage", "processed")
_DRAFTS_SUBDIR = ("data", "drafts")


def _processed_dir() -> str:
    path = os.path.join(ROOT_DIR, *_PROCESSED_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def _drafts_dir() -> str:
    path = os.path.join(ROOT_DIR, *_DRAFTS_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def _third_axis_splits(n: int) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    """Split range [0, n) into three contiguous segments with integer bounds."""
    a = n // 3
    b = (2 * n) // 3
    return (0, a), (a, b), (b, n)


def segment_triple_disc_image(
    image_path: str,
    parent_capture_uuid: str,
    *,
    write_crop_debug_jpegs_to_drafts: bool = True,
) -> list[str]:
    """
    Crop *image_path* into three equal segments (orientation-based).

    Output files under data/storage/processed/:
      {parent_capture_uuid}_slot{1,2,3}.jpg

    Optionally mirrors *crop* debug JPEGs under data/drafts/:
      {parent_capture_uuid}_crop{1,2,3}.jpg

    Returns three absolute filesystem paths in reading order:
      landscape: left → center → right; portrait: top → middle → bottom.
    """
    from PIL import Image

    if not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    out_dir = _processed_dir()
    paths: list[str] = []

    if w >= h:
        sx1, sx2, sx3 = _third_axis_splits(w)
        boxes = [(sx1[0], 0, sx1[1], h), (sx2[0], 0, sx2[1], h), (sx3[0], 0, sx3[1], h)]
        layout = "columns"
    else:
        sy1, sy2, sy3 = _third_axis_splits(h)
        boxes = [(0, sy1[0], w, sy1[1]), (0, sy2[0], w, sy2[1]), (0, sy3[0], w, sy3[1])]
        layout = "rows"

    print(f" [TripleDisc/PIL] orientation={layout} size={w}x{h}")

    drafts_base = _drafts_dir()

    for i, box in enumerate(boxes, start=1):
        crop = img.crop(box)
        out_name = f"{parent_capture_uuid}_slot{i}.jpg"
        out_path = os.path.join(out_dir, out_name)
        crop.save(out_path, quality=92)
        abs_path = os.path.abspath(out_path)
        paths.append(abs_path)
        print(f" [TripleDisc/PIL] slot {i} -> {out_path}")

        if write_crop_debug_jpegs_to_drafts:
            debug_name = f"{parent_capture_uuid}_crop{i}.jpg"
            debug_path = os.path.join(drafts_base, debug_name)
            crop.save(debug_path, quality=92)
            print(f" [TripleDisc/PIL] debug crop -> {debug_path}")

    return paths
