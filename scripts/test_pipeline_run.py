import pika
import json
import sys
import os

# Ensure root is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ingestor.schema import Manifest

def main():
    print(" [*] Connecting to RabbitMQ...")
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters('localhost'))
        channel = connection.channel()
    except Exception as e:
        print(f" [!] Failed to connect to RabbitMQ: {e}")
        sys.exit(1)

    # Ensure all queues exist so we can purge them later
    channel.queue_declare(queue="manifest_pipeline", durable=True)
    channel.queue_declare(queue="financial_pipeline", durable=True)
    channel.queue_declare(queue="final_results", durable=True)

    # Purge before test
    channel.queue_purge("manifest_pipeline")
    channel.queue_purge("financial_pipeline")
    channel.queue_purge("final_results")

    # Create mock manifest with test financials
    mock_manifest = Manifest(
        status="pending_forensic_ocr",
        image_paths=["data/test_images/dummy.jpg"]
    )
    # 10.00 DVD and 1.00 acquisition
    mock_manifest.financials["listing_price"] = 10.00
    mock_manifest.financials["acquisition_cost"] = 1.00
    message = mock_manifest.model_dump_json()
    
    channel.basic_publish(
        exchange='',
        routing_key="manifest_pipeline",
        body=message,
        properties=pika.BasicProperties(
            delivery_mode=2,
        )
    )
    print(f" [x] Sent mock manifest to 'manifest_pipeline' queue.")
    
    print(" [*] Waiting for final validation on 'final_results' queue (timeout 15s)...")
    
    # Simple consume loop to wait for 1 message
    result_manifest = None
    for method, properties, body in channel.consume(queue="final_results", inactivity_timeout=15):
        if body is None:
            print(" [!] Timed out waiting for final result.")
            break
            
        print(" [v] Received final manifest from pipeline!")
        data = json.loads(body)
        result_manifest = Manifest(**data)
        
        # Acknowledge
        channel.basic_ack(delivery_tag=method.delivery_tag)
        break

    # Stop consuming
    channel.cancel()
    
    # Verification
    if result_manifest:
        print("\n=== FINAL MANIFEST JSON ===")
        print(result_manifest.model_dump_json(indent=2))
        print("===========================\n")
        
        net_profit = result_manifest.financials.get("net_profit", 0.0)
        review_required = result_manifest.flags.get("human_review_required", True)
        
        print(f" -> Net Profit: ${net_profit}")
        print(f" -> Human Review Required: {review_required}")
        
        if net_profit == 2.95 and not review_required:
            print("\n [SUCCESS] Pipeline validation passed! Expected $2.95 profit and no review.")
        else:
            print("\n [FAILED] Pipeline validation failed. Metrics do not match expectations.")
    else:
        print("\n [FAILED] No manifest returned from pipeline.")

    # Cleanup: purge queues
    print("\n [*] Purging queues for cleanup...")
    channel.queue_purge("manifest_pipeline")
    channel.queue_purge("financial_pipeline")
    channel.queue_purge("final_results")
    print(" [*] Cleanup complete.")

    connection.close()

if __name__ == "__main__":
    main()
