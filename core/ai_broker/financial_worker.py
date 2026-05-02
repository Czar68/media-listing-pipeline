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
    print(" [v] Success: Manifest schema, calculator, and pricing oracle imported.")
except ImportError as e:
    print(f" [!] Import Error: {e}")
    raise

# Configuration from environment
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "financial_pipeline_v2"

def process_financials(manifest: Manifest) -> Manifest:
    """
    Process financial calculations for the manifest.
    """
    print(f" [*] Processing Financials for Transaction: {manifest.transaction_id}")
    
    # Call PricingOracle
    upc_or_title = manifest.identity.get("upc") or manifest.identity.get("title")
    oracle = PricingOracle()
    market_price = oracle.get_market_price(upc_or_title)
    
    if market_price is None:
        manifest.financials["listing_price"] = 9.99
        manifest.flags["human_review_required"] = True
    else:
        manifest.financials["listing_price"] = market_price

    # Extract listing_price and acquisition_cost from the manifest if available.
    # Defaulting to 0.0 if not present.
    listing_price = manifest.financials.get("listing_price", 0.0)
    acquisition_cost = manifest.financials.get("acquisition_cost", 0.0)
    
    # Calculate financials
    updated_financials = calculate_financials(listing_price, acquisition_cost)
    
    # Update manifest financials
    manifest.financials.update(updated_financials)
    
    # Business logic for listing status
    net_profit = updated_financials.get("net_profit", 0.0)
    
    if net_profit < 2.00:
        manifest.status = "STATUS_LOT_ONLY"
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

    print(f" [*] Financial Worker started on queue '{RABBITMQ_QUEUE}'. Waiting for messages...")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print(" [*] Stopping worker...")
        channel.stop_consuming()
        connection.close()

if __name__ == "__main__":
    start_worker()
