import os
import sys
import time
import uuid
import shutil
import pika
import json
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ingestor.schema import Manifest

INGRESS_DIR = os.path.join(ROOT_DIR, "data", "ingress")
STORAGE_DIR = os.path.join(ROOT_DIR, "data", "storage", "raw")
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_QUEUE = "manifest_pipeline_v2"

os.makedirs(INGRESS_DIR, exist_ok=True)
os.makedirs(STORAGE_DIR, exist_ok=True)

def push_to_rabbitmq(manifest: Manifest):
    try:
        connection = pika.BlockingConnection(pika.ConnectionParameters(host=RABBITMQ_HOST))
        channel = connection.channel()
        channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
        channel.basic_publish(
            exchange='',
            routing_key=RABBITMQ_QUEUE,
            body=manifest.model_dump_json(),
            properties=pika.BasicProperties(delivery_mode=2)
        )
        connection.close()
        print(f" [v] Pushed to {RABBITMQ_QUEUE}: {manifest.transaction_id}")
    except Exception as e:
        print(f" [!] RabbitMQ Error: {e}")

class ImageHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
            
        filepath = event.src_path
        filename = os.path.basename(filepath)
        
        if filename.lower().endswith(('.jpg', '.png')):
            # Wait for file to finish copying
            time.sleep(1)
            
            transaction_id = str(uuid.uuid4())
            new_filename = f"{transaction_id}_{filename}"
            new_filepath = os.path.join(STORAGE_DIR, new_filename)
            
            try:
                shutil.move(filepath, new_filepath)
                print(f" [*] Moved {filename} to {new_filepath}")
                
                manifest = Manifest(
                    transaction_id=transaction_id,
                    status="pending_forensic_ocr",
                    image_paths=[new_filepath]
                )
                
                push_to_rabbitmq(manifest)
            except Exception as e:
                print(f" [!] Error processing {filename}: {e}")

def start_monitor():
    event_handler = ImageHandler()
    observer = Observer()
    observer.schedule(event_handler, path=INGRESS_DIR, recursive=False)
    observer.start()
    
    print(f" [*] Monitoring {INGRESS_DIR} for new images...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print(" [*] Stopping monitor...")
    observer.join()

if __name__ == "__main__":
    start_monitor()
