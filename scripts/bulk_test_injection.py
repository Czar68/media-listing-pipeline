import pika
import json
import sys
import os
import uuid
import time

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

    channel.queue_declare(queue="manifest_pipeline_v2", durable=True)

    hub_codes_to_test = [
        "BVDL-123456",     # The Matrix (Valid)
        "UNIV-987654",     # The Office (Valid)
        "WB-456789",       # Friends (Valid)
        "UNKNOWN-123",     # Invalid -> Human Review
        "FAKE-999"         # Invalid -> Human Review
    ]

    print(" [*] Injecting 5 manifests...")
    for hub in hub_codes_to_test:
        tx_id = str(uuid.uuid4())
        mock_manifest = Manifest(
            transaction_id=tx_id,
            status="pending_forensic_ocr",
            image_paths=[f"data/test_images/{hub}.jpg"]
        )
        # Give them all a $10 listing price so profit > $2, meaning only the 
        # missing hub code triggers human review.
        mock_manifest.financials["listing_price"] = 10.00
        mock_manifest.financials["acquisition_cost"] = 1.00
        
        message = mock_manifest.model_dump_json()
        
        channel.basic_publish(
            exchange='',
            routing_key="manifest_pipeline_v2",
            body=message,
            properties=pika.BasicProperties(
                delivery_mode=2,
            )
        )
        print(f" [x] Sent manifest {tx_id} with hub code {hub}")

    connection.close()
    print(" [*] Bulk injection complete.")

if __name__ == "__main__":
    main()
