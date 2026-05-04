import json
import logging
import os
import re
import sys
from copy import deepcopy
from uuid import uuid4

import pika

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    from core.ingestor.schema import Manifest, game_identity_template
    from core.ai_broker.ocr_engine import DiscScanner
    from core.ai_broker.disc_detection import detect_discs_in_image, smart_crop_disc_with_circular_mask
    from core.adapters.upc_oracle import lookup_by_hub_code
    from core.logic.domain_config import get_domain_config, normalize_gemini_model_id
    from core.logic.game_listing_defaults import EBAY_CONDITION_ID, EBAY_CONDITION_LABEL
    from core.ai_broker.connection import connect_with_retry
    from core.ai_broker.gemini_env import get_gemini_model_name, require_google_api_key
    print(
        " [v] Success: Manifest schema, DiscScanner, disc_detection (Gemini multi-disc), "
        "domain_config, connection imported."
    )
except ImportError as e:
    print(f" [!] Import Error: {e}")
    raise

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "manifest_pipeline_v2"

DOMAIN_CONFIG = get_domain_config()

logging.basicConfig(level=logging.INFO)


def _processed_dir() -> str:
    path = os.path.join(ROOT_DIR, "data", "storage", "processed")
    os.makedirs(path, exist_ok=True)
    return path


def _safe_serial_filename(serial: str) -> str:
    s = re.sub(r"[^\w\-.]+", "_", (serial or "").strip()).strip("._-")
    return s[:120] if s else ""


def _resolve_crop_filename(out_dir: str, serial: str, parent_capture_uuid: str, disc_index: int) -> str:
    """
    Primary filename = sanitized Gemini ``serial_number`` (e.g. SLUS-20974.jpg) so
    listing assets align with catalog identity; disambiguate rare collisions.
    """
    base = _safe_serial_filename(serial)
    if base:
        fname = f"{base}.jpg"
        if os.path.isfile(os.path.join(out_dir, fname)):
            fname = f"{base}_{disc_index}.jpg"
    else:
        fname = f"disc_{parent_capture_uuid[:8]}_{disc_index}.jpg"
    return fname


def _build_game_unit_manifest_for_finance(
    parent: Manifest,
    crop_abs_path: str,
    disc: dict,
    parent_capture_uuid: str,
    disc_index: int,
) -> Manifest:
    """
    One manifest per detected disc for ``financial_pipeline_v2`` (then listing_worker).

    Default ``listing_price`` is 9.99 USD per individual game unit workflow.
    """
    serial = (disc.get("serial_number") or "").strip()
    vision_title = (disc.get("title") or "").strip()
    platform = (disc.get("platform") or "").strip()

    child_id = str(uuid4())
    id_body = game_identity_template()
    for k in ("title_hint", "metadata_source"):
        if k in parent.identity:
            id_body[k] = parent.identity[k]
    id_body["format"] = parent.identity.get("format") or "Game Disc"
    id_body["ebay_condition_id"] = parent.identity.get("ebay_condition_id", EBAY_CONDITION_ID)
    id_body["ebay_condition_label"] = parent.identity.get("ebay_condition_label", EBAY_CONDITION_LABEL)
    id_body["parent_capture_uuid"] = parent_capture_uuid
    id_body["ai_disc_index"] = disc_index
    id_body["capture_layout"] = "gemini_multi_disc"
    id_body["listing_crop_serial_filename"] = os.path.basename(crop_abs_path)
    if platform:
        id_body["platform"] = platform

    flags = deepcopy(parent.flags)
    flags.pop("triple_disc_child", None)
    flags["lightweight_game_unit"] = True

    if serial:
        id_body["platform_code"] = serial
        oracle = lookup_by_hub_code(serial)
        if oracle.get("title"):
            id_body["title"] = oracle.get("title")
            id_body["upc"] = oracle.get("upc")
            pub = oracle.get("publisher") or oracle.get("artist")
            if pub:
                id_body["publisher"] = pub
            id_body["confidence"] = float(oracle.get("confidence", 0.95))
            flags["human_review_required"] = False
        else:
            id_body["title"] = vision_title or None
            id_body["confidence"] = 0.85
            flags["human_review_required"] = True
    else:
        id_body["title"] = vision_title or None
        id_body["confidence"] = 0.75
        flags["human_review_required"] = True

    fin = deepcopy(parent.financials)
    fin["listing_price"] = 9.99
    fin["acquisition_cost"] = float(fin.get("acquisition_cost", 1.0))
    fin["packaging_cost"] = float(fin.get("packaging_cost", 0.25))

    raw_id = serial or child_id
    return Manifest(
        transaction_id=child_id,
        status="pending_financial_evaluation",
        raw_identifier=raw_id,
        image_paths=[crop_abs_path],
        identity=id_body,
        financials=fin,
        flags=flags,
    )


def _apply_ocr_games(manifest: Manifest, ocr_result: dict) -> None:
    hub_code = ocr_result.get("hub_code")
    manifest.identity["platform_code"] = ocr_result.get("platform_code") or hub_code
    manifest.identity["region"] = ocr_result.get("region")
    manifest.identity["rating"] = ocr_result.get("rating")
    if ocr_result.get("publisher"):
        manifest.identity["publisher"] = ocr_result.get("publisher")
    if ocr_result.get("copyright_text"):
        manifest.identity["copyright_text"] = ocr_result.get("copyright_text")

    if hub_code:
        print(f" [OCR] Extracted platform code: {hub_code}")
        manifest.raw_identifier = hub_code
        manifest.identity["raw_identifier"] = hub_code

        oracle_result = lookup_by_hub_code(hub_code)
        if oracle_result.get("title"):
            manifest.identity["upc"] = oracle_result.get("upc")
            manifest.identity["title"] = oracle_result.get("title")
            pub = oracle_result.get("publisher") or oracle_result.get("artist")
            if pub:
                manifest.identity["publisher"] = pub
            manifest.identity["confidence"] = oracle_result.get("confidence", 0.95)
            manifest.flags["human_review_required"] = False
            manifest.status = "pending_financial_evaluation"
            print(f" [API] Identity matched. Advancing status: {manifest.status}")
        else:
            manifest.identity["confidence"] = ocr_result.get("confidence", 0.9)
            manifest.flags["human_review_required"] = True
            manifest.status = "pending_financial_evaluation"
    else:
        print(" [OCR] No platform / hub code extracted.")
        manifest.status = "pending_financial_evaluation"
        manifest.flags["human_review_required"] = True
        manifest.identity["confidence"] = ocr_result.get("confidence", 0.5)


def _apply_ocr_movies(manifest: Manifest, ocr_result: dict) -> None:
    hub_code = ocr_result.get("hub_code")
    if hub_code:
        print(f" [OCR] Extracted Hub Code: {hub_code}")
        manifest.raw_identifier = hub_code
        manifest.identity["raw_identifier"] = hub_code

        oracle_result = lookup_by_hub_code(hub_code)
        if oracle_result.get("title"):
            manifest.identity["upc"] = oracle_result.get("upc")
            manifest.identity["title"] = oracle_result.get("title")
            manifest.identity["artist"] = oracle_result.get("artist")
            manifest.identity["confidence"] = oracle_result.get("confidence", 0.95)
            manifest.flags["human_review_required"] = False
            manifest.status = "pending_financial_evaluation"
            print(f" [API] Identity matched. Advancing status: {manifest.status}")
        else:
            manifest.identity["confidence"] = ocr_result.get("confidence", 0.9)
            manifest.flags["human_review_required"] = True
            manifest.status = "pending_financial_evaluation"
    else:
        print(" [OCR] No Hub Code extracted.")
        manifest.status = "pending_financial_evaluation"
        manifest.flags["human_review_required"] = True
        manifest.identity["confidence"] = ocr_result.get("confidence", 0.5)


def process_image(manifest: Manifest) -> tuple[list[Manifest], list[Manifest]]:
    """
    Identity step.

    Returns
    -------
    (republish_manifest_v2, forward_financial)

    **Video game individual units (GAMES scan):** ``detect_discs_in_image`` runs on the
    full raw frame (up to **3** discs). Each disc gets a **1000×1000** smart crop
    (serial-based JPEG name) and a manifest with **listing_price 9.99**, then routes to
    **``financial_pipeline_v2``** for unit economics before **listing_worker**.
    """
    domain = DOMAIN_CONFIG["domain"]
    print(f" [*] process_image Transaction: {manifest.transaction_id} | domain: {domain}")

    republish_manifest_v2: list[Manifest] = []
    forward_financial: list[Manifest] = []

    if manifest.status == "pending_forensic_ocr":
        if domain == "GAMES" and not manifest.flags.get("triple_disc_child"):
            parent_capture_uuid = manifest.transaction_id
            source_image = manifest.image_paths[0] if manifest.image_paths else None
            if not source_image or not os.path.isfile(source_image):
                print(" [!] No valid image path on manifest; cannot run multi-disc vision.")
                manifest.status = "identity_failed"
                manifest.flags["human_review_required"] = True
                return republish_manifest_v2, forward_financial

            vision_model = normalize_gemini_model_id(
                get_gemini_model_name(DOMAIN_CONFIG["ocr_model"])
            )
            print(
                f" [*] GAMES — full-frame Gemini vision (model={vision_model!r}); "
                "up to 3 discs → financial_pipeline_v2 per unit..."
            )

            discs = detect_discs_in_image(source_image, model_id=vision_model)
            if not discs:
                raise RuntimeError("Gemini reported zero discs in the scan; refusing empty pipeline.")

            out_dir = _processed_dir()
            for idx, disc in enumerate(discs):
                bbox = disc.get("bounding_box")
                if not isinstance(bbox, list) or len(bbox) != 4:
                    continue
                serial = (disc.get("serial_number") or "").strip()
                fname = _resolve_crop_filename(out_dir, serial, parent_capture_uuid, idx)
                crop_path = os.path.join(out_dir, fname)
                crop_abs = os.path.abspath(crop_path)
                smart_crop_disc_with_circular_mask(source_image, bbox, crop_abs)

                unit_manifest = _build_game_unit_manifest_for_finance(
                    manifest, crop_abs, disc, parent_capture_uuid, idx
                )
                forward_financial.append(unit_manifest)
                print(
                    f" [v] Disc {idx + 1}/{len(discs)} → financial tx={unit_manifest.transaction_id} "
                    f"crop={crop_abs}"
                )

            if not forward_financial:
                raise RuntimeError(
                    "Vision returned discs but no valid crops were produced (check bounding_box values)."
                )

            return republish_manifest_v2, forward_financial

        if domain == "GAMES" and manifest.flags.get("triple_disc_child"):
            print(" [*] Legacy triple_disc_child crop — single DiscScanner → financial...")
            scanner = DiscScanner()
            image_path = manifest.image_paths[0] if manifest.image_paths else "dummy_path.jpg"
            ocr_result = scanner.analyze_image(image_path)
            _apply_ocr_games(manifest, ocr_result)
            if manifest.status == "pending_financial_evaluation":
                forward_financial.append(manifest)
            return republish_manifest_v2, forward_financial

        print(" [*] Forensic OCR (MOVIES single capture)...")
        scanner = DiscScanner()
        image_path = manifest.image_paths[0] if manifest.image_paths else "dummy_path.jpg"
        ocr_result = scanner.analyze_image(image_path)
        _apply_ocr_movies(manifest, ocr_result)
        if manifest.status == "pending_financial_evaluation":
            forward_financial.append(manifest)
        return republish_manifest_v2, forward_financial

    if manifest.raw_identifier:
        manifest.identity["title"] = f"Analyzed: {manifest.raw_identifier}"
        manifest.identity["confidence"] = 0.85
        manifest.identity["metadata_source"] = "gemini-1.5-pro-audit"
        manifest.status = "identity_resolved"
        manifest.flags["conflict_detected"] = False
    else:
        manifest.status = "identity_failed"
        manifest.flags["human_review_required"] = True

    return republish_manifest_v2, forward_financial


def process_identity(manifest: Manifest) -> tuple[list[Manifest], list[Manifest]]:
    return process_image(manifest)


def handle_task(ch, method, properties, body):
    try:
        data = json.loads(body)
        manifest = Manifest(**data)

        republish, forward_financial = process_image(manifest)

        for child in republish:
            print(f" [->] Routing child {child.transaction_id} -> {RABBITMQ_QUEUE}")
            ch.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
            ch.basic_publish(
                exchange="",
                routing_key=RABBITMQ_QUEUE,
                body=child.model_dump_json(),
                properties=pika.BasicProperties(delivery_mode=2),
            )

        for enriched in forward_financial:
            print(f" [v] Result: {enriched.model_dump_json()}")
            if enriched.status == "pending_financial_evaluation":
                print(" [->] Routing to financial_pipeline_v2...")
                ch.queue_declare(queue="financial_pipeline_v2", durable=True)
                ch.basic_publish(
                    exchange="",
                    routing_key="financial_pipeline_v2",
                    body=enriched.model_dump_json(),
                    properties=pika.BasicProperties(delivery_mode=2),
                )

        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f" [!] Error processing message: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def start_worker():
    """
    Gemini requires GOOGLE_API_KEY and GEMINI_MODEL (Compose maps OCR_MODEL → GEMINI_MODEL).
    """
    require_google_api_key("identity_worker (startup)")
    _gm = normalize_gemini_model_id(get_gemini_model_name(DOMAIN_CONFIG["ocr_model"]))
    print(
        f" [*] Gemini env OK — GEMINI_MODEL={_gm!r} GOOGLE_API_KEY is set.",
        flush=True,
    )

    connection = connect_with_retry(RABBITMQ_HOST, "IdentityWorker")

    channel = connection.channel()
    channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=handle_task)

    print(f" [*] Identity Worker started on queue '{RABBITMQ_QUEUE}'. Waiting for messages...")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print(" [*] Stopping worker...")
        channel.stop_consuming()
        connection.close()


if __name__ == "__main__":
    start_worker()
