import json
import logging
import sys
import os

import pika

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    from core.ingestor.schema import Manifest
    from core.listing_engine.seo_optimiser import generate_ebay_title, generate_sku
    from core.logic.domain_config import get_domain_config
    from core.logic.game_listing_defaults import (
        EBAY_CATEGORY_ID_GAMES,
        EBAY_CONDITION_ID,
        EBAY_CONDITION_LABEL,
    )
    from core.ai_broker.gemini_env import get_gemini_model_name, require_google_api_key
    from core.ai_broker.connection import connect_with_retry
    print(" [v] Success: Modules imported.")
except ImportError as e:
    print(f" [!] Import Error: {e}")
    raise

logging.basicConfig(level=logging.INFO)
_LOGGER = logging.getLogger(__name__)

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "listing_pipeline_v2"
DRAFTS_DIR = os.path.join(ROOT_DIR, "data", "drafts")

DOMAIN_CONFIG = get_domain_config()
GEMINI_MODEL = get_gemini_model_name(DOMAIN_CONFIG["listing_model"])

os.makedirs(DRAFTS_DIR, exist_ok=True)


def generate_pro_description(title: str, domain: str) -> str:
    """
    Generate listing description via Gemini (GEMINI_MODEL + GOOGLE_API_KEY).
    No silent mock fallback: missing API key logs CRITICAL and raises.
    """
    require_google_api_key("listing_worker")
    google_api_key = os.getenv("GOOGLE_API_KEY", "").strip()

    print(f" [{GEMINI_MODEL}] Generating SEO description for: '{title}' (domain: {domain})")

    try:
        from google import genai

        prompt = (
            f"You are an expert eBay copywriter. Write a high-converting listing description "
            f"for a {domain} replacement disc: '{title}'.\n"
            f"Include: condition disclosure, authenticity statement, shipping assurance, "
            f"and a bundle savings hook. Keep it under 300 words."
        )
        client = genai.Client(api_key=google_api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        text = (getattr(response, "text", None) or "").strip()
        if not text:
            _LOGGER.error(
                "Gemini listing returned empty text (model=%s); refusing placeholder body.",
                GEMINI_MODEL,
            )
            raise RuntimeError("Gemini returned empty description text.")
        print(f" [{GEMINI_MODEL}] Gemini response received.")
        return text
    except Exception as e:
        _LOGGER.exception("Gemini listing generation failed (model=%s).", GEMINI_MODEL)
        raise


def process_listing(manifest: Manifest) -> dict:
    """
    Hydrates the manifest with listing data and generates a draft.
    """
    print(f" [*] Processing Listing Draft for Transaction: {manifest.transaction_id}")

    if DOMAIN_CONFIG["domain"] == "GAMES":
        manifest.identity["ebay_condition_id"] = EBAY_CONDITION_ID
        manifest.identity["ebay_condition_label"] = EBAY_CONDITION_LABEL

    manifest.identity["ebay_category_id"] = EBAY_CATEGORY_ID_GAMES
    
    title = manifest.identity.get("title") or "Unknown Title"
    
    ebay_title = generate_ebay_title(title=title)
    sku = generate_sku(manifest.raw_identifier)

    ebay_description = generate_pro_description(title=title, domain=DOMAIN_CONFIG["domain"])

    if manifest.flags.get("human_review_required"):
        draft_status = "DRAFT_PENDING_APPROVAL"
    else:
        draft_status = "READY_TO_PUBLISH"
        
    draft = {
        "transaction_id": manifest.transaction_id,
        "draft_status": draft_status,
        "ebay_category_id": EBAY_CATEGORY_ID_GAMES,
        "sku": sku,
        "title": ebay_title,
        "description": ebay_description,
        "financials": manifest.financials,
        "source_manifest": manifest.model_dump()
    }

    draft_filename = f"{manifest.transaction_id}.json"
    draft_filepath = os.path.join(DRAFTS_DIR, draft_filename)

    with open(draft_filepath, "w") as f:
        json.dump(draft, f, indent=2)

    print(f" [v] Draft saved to: {draft_filepath}")
    return draft


def handle_task(ch, method, properties, body):
    try:
        data = json.loads(body)
        manifest = Manifest(**data)

        draft = process_listing(manifest)

        if draft["draft_status"] == "READY_TO_PUBLISH":
            print(f" [->] Routing to sync_pipeline...")
            ch.queue_declare(queue="sync_pipeline", durable=True)
            ch.basic_publish(
                exchange='',
                routing_key="sync_pipeline",
                body=json.dumps(draft),
                properties=pika.BasicProperties(delivery_mode=2)
            )

        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f" [!] Error processing message: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def start_worker():
    """Fail fast when GOOGLE_API_KEY is absent so Gemini is never mocked."""
    require_google_api_key("listing_worker (startup)")
    print(
        f" [*] Gemini env OK — GEMINI_MODEL={GEMINI_MODEL!r} GOOGLE_API_KEY is set.",
        flush=True,
    )

    connection = connect_with_retry(RABBITMQ_HOST, "ListingWorker")

    channel = connection.channel()
    channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=handle_task)

    print(f" [*] Listing Worker started on queue '{RABBITMQ_QUEUE}'. Waiting for messages...")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print(" [*] Stopping worker...")
        channel.stop_consuming()
        connection.close()


if __name__ == "__main__":
    start_worker()
