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
    from core.financials.calculator import calculate_financials
    from core.adapters.pricing_oracle import PricingOracle
    from core.logic.domain_config import get_domain_config
    from core.logic.game_listing_defaults import EBAY_CONDITION_ID, EBAY_CONDITION_LABEL
    from core.ai_broker.connection import connect_with_retry
    print(" [v] Success: Manifest schema, calculator, pricing oracle, and connection imported.")
except ImportError as e:
    print(f" [!] Import Error: {e}")
    raise

# Configuration from environment
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "financial_pipeline_v2"

DOMAIN_CONFIG = get_domain_config()


def process_financials(manifest: Manifest) -> Manifest:
    """
    Process financial calculations for the manifest.

    Individual video game units use USPS **Ground Advantage** (under ~1 lb,
    padded mailer). Economics use ``calculate_financials`` (standard parcel tier,
    not USPS promotional library/educational book rates).
    """
    print(f" [*] Processing Financials for Transaction: {manifest.transaction_id}")

    if DOMAIN_CONFIG["domain"] == "GAMES":
        manifest.identity["ebay_condition_id"] = EBAY_CONDITION_ID
        manifest.identity["ebay_condition_label"] = EBAY_CONDITION_LABEL

    # Call PricingOracle
    upc_or_title = manifest.identity.get("upc") or manifest.identity.get("title")
    oracle = PricingOracle()
    market_price = oracle.get_market_price(upc_or_title)
    
    if market_price is None:
        manifest.financials["listing_price"] = 9.99
        manifest.flags["human_review_required"] = True
    else:
        manifest.financials["listing_price"] = market_price

    listing_price = float(manifest.financials.get("listing_price", 0.0))
    acquisition_cost = float(
        manifest.financials.get("acquisition_cost", 1.0)
    )
    packaging_cost = float(manifest.financials.get("packaging_cost", 0.25))

    updated_financials = calculate_financials(
        listing_price, acquisition_cost, packaging_cost
    )
    
    # Update manifest financials
    manifest.financials.update(updated_financials)
    
    net_profit = updated_financials.get("net_profit", 0.0)

    if net_profit < 0.0:
        manifest.status = "STATUS_LOT_ONLY"
        return manifest

    # Thin margin: avoid "trading dollars" on low-value games after Ground Advantage + unit basis.
    if net_profit < 1.50:
        manifest.status = "flagged_for_review"
        manifest.flags["human_review_required"] = True
        return manifest

    if not manifest.flags.get("human_review_required"):
        manifest.status = "ready_for_listing"
    else:
        manifest.status = "flagged_for_review"

    return manifest

def handle_task(ch, method, properties, body):
    try:
        data = json.loads(body)
        manifest = Manifest(**data)
        
        enriched_manifest = process_financials(manifest)
        
        print(f" [v] Result: {enriched_manifest.model_dump_json()}")
        
        if enriched_manifest.status not in ("REJECTED_LOW_MARGIN", "STATUS_LOT_ONLY"):
            # Route to listing_pipeline for draft generation
            ch.queue_declare(queue="listing_pipeline_v2", durable=True)
            ch.basic_publish(
                exchange='',
                routing_key="listing_pipeline_v2",
                body=enriched_manifest.model_dump_json(),
                properties=pika.BasicProperties(delivery_mode=2)
            )
        else:
            print(f" [x] Item rejected or lotted: {enriched_manifest.status}")
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f" [!] Error processing message: {e}")
        # Reject and don't requeue to avoid infinite loops on bad data
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

def start_worker():
    connection = connect_with_retry(RABBITMQ_HOST, "FinancialWorker")

    channel = connection.channel()
    channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=handle_task)

    print(f" [*] Financial Worker started on queue '{RABBITMQ_QUEUE}'. Waiting for messages...")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print(" [*] Stopping worker...")
        channel.stop_consuming()
        connection.close()

if __name__ == "__main__":
    start_worker()
