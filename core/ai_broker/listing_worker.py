import json
import logging
import re
import sys
import os

import pika

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    from core.ingestor.schema import Manifest
    from core.listing_engine.seo_optimiser import generate_sku
    from core.listing_engine.templates import (
        get_disc_only_description,
        get_fallback_ebay_title,
    )
    from core.logic.domain_config import get_domain_config
    from core.logic.game_listing_defaults import (
        EBAY_CATEGORY_ID_GAMES,
        EBAY_CONDITION_ID,
        EBAY_CONDITION_LABEL,
    )
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
CLAUDE_LISTING_MODEL = "claude-haiku-4-5-20251001"

os.makedirs(DRAFTS_DIR, exist_ok=True)


def _strip_outer_quotes(text: str) -> str:
    t = (text or "").strip()
    if len(t) >= 2 and t[0] in "\"'" and t[-1] == t[0]:
        t = t[1:-1].strip()
    return t


def _claude_completion(prompt: str, *, max_tokens: int) -> str:
    from anthropic import Anthropic

    api_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set.")

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model=CLAUDE_LISTING_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    parts: list[str] = []
    for block in message.content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts).strip()


def generate_pro_title(game_title: str, platform: str) -> str:
    """
    eBay title via Claude Haiku; on failure use template fallback (≤80 chars).
    Uses manifest identity ``title`` and ``platform``.
    """
    gt = (game_title or "Unknown Title").strip()
    plat = (platform or "").strip() or "Unknown platform"

    prompt = (
        "Generate an eBay listing title for this video game disc. Format: '{game_title} {platform_short} Disc Only {keyword1} {keyword2}'. "
        "Rules: platform_short = PS1 for PlayStation/PlayStation 1, PS2 for PlayStation 2, PS3 for PlayStation 3, Xbox for Xbox, GCN for GameCube, N64 for Nintendo 64. "
        "Keywords = 1-2 genre or category terms buyers actually search on eBay (examples: Horror, Platformer, Racing, Sports, RPG, Fighting, Shooter, Action, Adventure, Classic, Authentic, NTSC, Multiplayer). "
        "Total title must be 80 characters or less. Return the title text only, nothing else, no quotes.\n\n"
        f'Inventory game title (identity.title): "{gt}"\n'
        f'Inventory platform (identity.platform): "{plat}"'
    )

    api_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        _LOGGER.warning("ANTHROPIC_API_KEY unset; using template listing title for %r.", gt)
        return get_fallback_ebay_title(gt, plat)

    print(f" [{CLAUDE_LISTING_MODEL}] Generating eBay title for: {gt!r} (platform: {plat!r})")

    try:
        raw = _claude_completion(prompt, max_tokens=256)
        text = _strip_outer_quotes(raw)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            raise RuntimeError("Claude returned empty title text.")
        if len(text) > 80:
            text = text[:80].rstrip()
        print(f" [{CLAUDE_LISTING_MODEL}] Claude title received.")
        return text
    except Exception as e:
        _LOGGER.warning(
            "Claude title generation failed; using template fallback (model=%s): %s",
            CLAUDE_LISTING_MODEL,
            e,
        )
        return get_fallback_ebay_title(gt, plat)


def generate_pro_description(game_title: str, platform: str) -> str:
    """
    eBay description via Claude Haiku; on failure use template fallback.
    Uses manifest identity ``title`` and ``platform``.
    """
    gt = (game_title or "Unknown Title").strip()
    plat = (platform or "").strip() or "the listed platform"

    prompt = (
        f"Write a 3-4 sentence eBay product description for {gt} on {plat}. Include: this is a disc only listing with no case, artwork, or manual. "
        "The disc is an authentic original release in used condition with normal wear. Mention the genre and any notable series or franchise connections naturally as search keywords. "
        "End with: ships same business day in protective padded mailer. Keep it factual, clean, and buyer-friendly. No hype, no false claims, no mention of replacement or refurbishment."
    )

    api_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        _LOGGER.warning(
            "ANTHROPIC_API_KEY unset; using template listing description for %r.",
            gt,
        )
        return get_disc_only_description(gt, plat)

    print(f" [{CLAUDE_LISTING_MODEL}] Generating description for: {gt!r} (platform: {plat!r})")

    try:
        raw = _claude_completion(prompt, max_tokens=2048)
        text = raw.strip()
        if not text:
            raise RuntimeError("Claude returned empty description text.")
        print(f" [{CLAUDE_LISTING_MODEL}] Claude description received.")
        return text
    except Exception as e:
        _LOGGER.warning(
            "Claude listing generation failed; using template fallback (model=%s): %s",
            CLAUDE_LISTING_MODEL,
            e,
        )
        return get_disc_only_description(gt, plat)


def process_listing(manifest: Manifest) -> dict:
    """
    Hydrates the manifest with listing data and generates a draft.
    """
    print(f" [*] Processing Listing Draft for Transaction: {manifest.transaction_id}")

    if DOMAIN_CONFIG["domain"] == "GAMES":
        manifest.identity["ebay_condition_id"] = EBAY_CONDITION_ID
        manifest.identity["ebay_condition_label"] = EBAY_CONDITION_LABEL

    manifest.identity["ebay_category_id"] = EBAY_CATEGORY_ID_GAMES

    game_title = manifest.identity.get("title") or "Unknown Title"
    platform = manifest.identity.get("platform") or ""

    ebay_title = generate_pro_title(game_title=game_title, platform=platform)
    sku = generate_sku(manifest.raw_identifier)
    ebay_description = generate_pro_description(game_title=game_title, platform=platform)

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
        "source_manifest": manifest.model_dump(),
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
                exchange="",
                routing_key="sync_pipeline",
                body=json.dumps(draft),
                properties=pika.BasicProperties(delivery_mode=2),
            )

        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f" [!] Error processing message: {e}")
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def start_worker():
    """Titles and descriptions use Claude when ANTHROPIC_API_KEY is set; else template fallbacks."""
    ak = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if ak:
        print(
            f" [*] Listing worker — ANTHROPIC_API_KEY set; title + description via Claude ({CLAUDE_LISTING_MODEL!r}).",
            flush=True,
        )
    else:
        print(
            " [*] Listing worker — ANTHROPIC_API_KEY unset; title + description use template fallbacks only.",
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
