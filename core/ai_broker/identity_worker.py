import pika
import json
import sys
import os
import time
from sqlalchemy import create_engine

# Ensure the root directory is in sys.path for absolute imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    from core.ingestor.schema import Manifest
    from core.ai_broker.ocr_engine import DiscScanner
    from core.adapters.upc_oracle import lookup_by_hub_code
    from core.logic.domain_config import get_domain_config
    print(" [v] Success: Manifest schema, DiscScanner, upc_oracle, and domain_config imported.")
except ImportError as e:
    print(f" [!] Import Error: {e}")
    # Fallback to local import if needed or raise
    raise

# Configuration from environment
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "manifest_pipeline_v2"
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:pipeline_secret@localhost:5433/media_pipeline")

# Load domain config once on startup — workers read ACTIVE_DOMAIN from env
DOMAIN_CONFIG = get_domain_config()

def process_identity(manifest: Manifest) -> Manifest:
    """
    Processing logic for identity enrichment, including Forensic OCR.
    Active domain: DOMAIN_CONFIG['domain'] (set via ACTIVE_DOMAIN env var).
    """
    print(f" [*] Processing Identity for Transaction: {manifest.transaction_id} | domain: {DOMAIN_CONFIG['domain']}")
    
    if manifest.status == "pending_forensic_ocr":
        print(" [*] Initiating Forensic OCR...")
        scanner = DiscScanner()
        # In a real scenario, we'd pick the first image or a specific inner-ring image
        image_path = manifest.image_paths[0] if manifest.image_paths else "dummy_path.jpg"
        
        ocr_result = scanner.analyze_image(image_path)
        
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
            
        return manifest
        
    # Original Mocking AI enrichment
    if manifest.raw_identifier:
        # Simulate lookup/analysis
        manifest.identity["title"] = f"Analyzed: {manifest.raw_identifier}"
        manifest.identity["confidence"] = 0.85
        manifest.identity["metadata_source"] = "gemini-1.5-pro-audit"
        manifest.status = "identity_resolved"
        manifest.flags["conflict_detected"] = False
    else:
        manifest.status = "identity_failed"
        manifest.flags["human_review_required"] = True
        
    return manifest

def handle_task(ch, method, properties, body):
    try:
        data = json.loads(body)
        manifest = Manifest(**data)
        
        enriched_manifest = process_identity(manifest)
        
        # Here you would typically save to Postgres
        # For now, we print the result
        print(f" [v] Result: {enriched_manifest.model_dump_json()}")
        
        if enriched_manifest.status == "pending_financial_evaluation":
            print(f" [->] Routing to financial_pipeline_v2...")
            ch.queue_declare(queue="financial_pipeline_v2", durable=True)
            ch.basic_publish(
                exchange='',
                routing_key="financial_pipeline_v2",
                body=enriched_manifest.model_dump_json(),
                properties=pika.BasicProperties(delivery_mode=2)
            )
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f" [!] Error processing message: {e}")
        # Reject and requeue or move to DLQ
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

    print(f" [*] Identity Worker started on queue '{RABBITMQ_QUEUE}'. Waiting for messages...")
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print(" [*] Stopping worker...")
        channel.stop_consuming()
        connection.close()

if __name__ == "__main__":
    start_worker()
