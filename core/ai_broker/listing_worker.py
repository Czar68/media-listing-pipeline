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
LISTING_MODEL = DOMAIN_CONFIG["listing_model"]   # claude-3-5-sonnet-20240620

# Ensure drafts directory exists
os.makedirs(DRAFTS_DIR, exist_ok=True)


def generate_sonnet_description(title: str, domain: str) -> str:
    """
    Calls Claude 3.5 Sonnet (LISTING_MODEL) to generate high-converting eBay copy.
    In production this will use the Anthropic Messages API; currently returns a
    rich mock so the full pipeline can run without credentials.
    """
    print(f" [{LISTING_MODEL}] Generating SEO description for: {title} (domain: {domain})")

    # --- Production hook (uncomment when ANTHROPIC_API_KEY is set) ----------
    # import anthropic
    # client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    # msg = client.messages.create(
    #     model=LISTING_MODEL,
    #     max_tokens=512,
    #     messages=[{
    #         "role": "user",
    #         "content": f"Write a high-converting eBay listing description for a {domain} disc: {title}."
    #     }]
    # )
    # return msg.content[0].text
    # -------------------------------------------------------------------------

    # Mock: merge the static template with a Sonnet-style opener
    base = get_disc_only_description(title=title)
    sonnet_opener = (
        f"✅ AUTHENTIC | {title}\n"
        f"Professionally verified replacement disc — ships same business day.\n\n"
    )
    return sonnet_opener + base

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
    
    # Generate Description via Claude 3.5 Sonnet
    ebay_description = generate_sonnet_description(title=title, domain=DOMAIN_CONFIG["domain"])
    
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
