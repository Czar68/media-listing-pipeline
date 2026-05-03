import pika
import json
import sys
import os
import time

# Ensure the root directory is in sys.path for absolute imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    from core.ingestor.schema import Manifest
    from core.listing_engine.templates import get_disc_only_description
    from core.listing_engine.seo_optimiser import generate_ebay_title, generate_sku
    from core.logic.domain_config import get_domain_config
    print(" [v] Success: Modules imported.")
except ImportError as e:
    print(f" [!] Import Error: {e}")
    raise

# Configuration from environment
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "listing_pipeline_v2"
DRAFTS_DIR = os.path.join(ROOT_DIR, "data", "drafts")

# Load domain config once on startup
DOMAIN_CONFIG = get_domain_config()
LISTING_MODEL = DOMAIN_CONFIG["listing_model"]   # gemini-1.5-pro

# Ensure drafts directory exists
os.makedirs(DRAFTS_DIR, exist_ok=True)


def generate_pro_description(title: str, domain: str) -> str:
    """
    PRIMARY: Gemini 1.5 Pro via Google AI Studio (GOOGLE_API_KEY).
    FALLBACK: Rich mock description so the pipeline runs without credentials.

    DeepSeek-Claude Bridge (commented out below) is the secondary option:
    it uses the Anthropic SDK pointed at the DeepSeek base URL, providing
    Claude-compatible responses at lower cost.
    """
    print(f" [{LISTING_MODEL}] Generating SEO description for: '{title}' (domain: {domain})")

    google_api_key = os.getenv("GOOGLE_API_KEY")

    # ── PRIMARY: Gemini 1.5 Pro (Google AI Studio) ──────────────────────────
    if google_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=google_api_key)
            model = genai.GenerativeModel(LISTING_MODEL)
            prompt = (
                f"You are an expert eBay copywriter. Write a high-converting listing description "
                f"for a {domain} replacement disc: '{title}'.\n"
                f"Include: condition disclosure, authenticity statement, shipping assurance, "
                f"and a bundle savings hook. Keep it under 300 words."
            )
            response = model.generate_content(prompt)
            print(f" [{LISTING_MODEL}] Gemini Pro response received.")
            return response.text
        except Exception as e:
            print(f" [{LISTING_MODEL}] Gemini Pro call failed: {e}. Using mock fallback.")

    # ── DEEPSEEK-CLAUDE BRIDGE (commented out — activate with DEEPSEEK_API_KEY) ──
    # Uses the Anthropic SDK but routes to DeepSeek's Anthropic-compatible endpoint.
    # Uncomment when DEEPSEEK_API_KEY and DEEPSEEK_BASE_URL are set in .env.
    #
    # import anthropic
    # deepseek_key = os.getenv("DEEPSEEK_API_KEY")
    # deepseek_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/anthropic")
    # if deepseek_key:
    #     try:
    #         client = anthropic.Anthropic(
    #             api_key=deepseek_key,
    #             base_url=deepseek_url,
    #         )
    #         msg = client.messages.create(
    #             model="deepseek-chat",
    #             max_tokens=512,
    #             messages=[{
    #                 "role": "user",
    #                 "content": (
    #                     f"Write a high-converting eBay listing description for a "
    #                     f"{domain} replacement disc: {title}."
    #                 )
    #             }]
    #         )
    #         return msg.content[0].text
    #     except Exception as e:
    #         print(f" [DeepSeek] Bridge call failed: {e}. Using mock fallback.")
    # ─────────────────────────────────────────────────────────────────────────

    # ── FALLBACK: rich mock (no credentials required) ────────────────────────
    base = get_disc_only_description(title=title)
    opener = (
        f"✅ AUTHENTIC | {title}\n"
        f"Professionally verified replacement disc — ships same business day.\n\n"
    )
    return opener + base

def process_listing(manifest: Manifest) -> dict:
    """
    Hydrates the manifest with listing data and generates a draft.
    """
    print(f" [*] Processing Listing Draft for Transaction: {manifest.transaction_id}")
    
    # Hydrate manifest fields
    manifest.identity["ebay_category_id"] = 617
    
    title = manifest.identity.get("title") or "Unknown Title"
    
    # Generate SEO Title
    ebay_title = generate_ebay_title(title=title)
    
    # Generate SKU
    sku = generate_sku(manifest.raw_identifier)
    
    # Generate Description via Gemini 1.5 Pro (with DeepSeek bridge fallback)
    ebay_description = generate_pro_description(title=title, domain=DOMAIN_CONFIG["domain"])
    
    # Determine Status
    if manifest.flags.get("human_review_required"):
        draft_status = "DRAFT_PENDING_APPROVAL"
    else:
        draft_status = "READY_TO_PUBLISH"
        
    draft = {
        "transaction_id": manifest.transaction_id,
        "draft_status": draft_status,
        "ebay_category_id": 617,
        "sku": sku,
        "title": ebay_title,
        "description": ebay_description,
        "financials": manifest.financials,
        "source_manifest": manifest.model_dump()
    }
    
    # Generate draft_listing.json
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
    print(f" [*] Connecting to RabbitMQ at {RABBITMQ_HOST}...")
    
    connection = None
    retry_count = 0
    while not connection and retry_count < 10:
        try:
            connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        except pika.exceptions.AMQPConnectionError:
            retry_count += 1
            print(f" [!] Connection failed. Retry {retry_count}/10 in 5s...")
            time.sleep(5)

    if not connection:
        print(" [!!!] Could not connect to RabbitMQ. Exiting.")
        sys.exit(1)

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
