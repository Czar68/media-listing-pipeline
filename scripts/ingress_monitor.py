"""
scripts/ingress_monitor.py
──────────────────────────
Image Ingestion Monitor for the media-listing pipeline.

Behaviour
─────────
1. STARTUP SCAN  — on launch, processes any .jpg/.png already sitting in
                   INGRESS_DIR so files dropped while the container was down
                   are never silently lost.
2. LIVE WATCH    — watchdog observer picks up new files as they arrive.
3. PUSH          — each accepted file is moved to data/storage/raw/ and a
                   pending_forensic_ocr manifest is published to RabbitMQ.

Environment variables
─────────────────────
  RABBITMQ_HOST  — defaults to 'rabbitmq'  (Docker service name, not localhost)
  INGRESS_DIR    — defaults to /app/data/ingress  (override for local dev)
"""

import logging
import os
import shutil
import sys
import time
import uuid

import pika
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

# ── Path bootstrap ────────────────────────────────────────────────────────────
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ingestor.schema import Manifest

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("ingress_monitor")

# ── Configuration ─────────────────────────────────────────────────────────────
# Default RABBITMQ_HOST = 'rabbitmq'  (Docker service name).
# Using 'localhost' here causes socket.gaierror inside the container because
# the broker runs in a separate container, not on localhost.
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_QUEUE = "manifest_pipeline_v2"

# INGRESS_DIR is overrideable via env so local dev can use a relative path
# while the container always uses the volume-mounted /app/data/ingress.
_default_ingress = os.path.join(ROOT_DIR, "data", "ingress")
INGRESS_DIR = os.getenv("INGRESS_DIR", _default_ingress)
STORAGE_DIR = os.path.join(ROOT_DIR, "data", "storage", "raw")

os.makedirs(INGRESS_DIR, exist_ok=True)
os.makedirs(STORAGE_DIR, exist_ok=True)

log.info("RABBITMQ_HOST  = %s", RABBITMQ_HOST)
log.info("INGRESS_DIR    = %s", INGRESS_DIR)
log.info("STORAGE_DIR    = %s", STORAGE_DIR)

_ACCEPTED_EXT = (".jpg", ".jpeg", ".png")


# ── RabbitMQ publisher ────────────────────────────────────────────────────────

def _make_connection() -> pika.BlockingConnection:
    """Open a fresh BlockingConnection (short-lived; one per publish)."""
    params = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        heartbeat=30,
        blocked_connection_timeout=10,
    )
    return pika.BlockingConnection(params)


def push_to_rabbitmq(manifest: Manifest) -> bool:
    """
    Publish a manifest to the pipeline queue.
    Returns True on success, False on any error.
    """
    try:
        conn = _make_connection()
        ch = conn.channel()
        ch.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
        ch.basic_publish(
            exchange="",
            routing_key=RABBITMQ_QUEUE,
            body=manifest.model_dump_json(),
            properties=pika.BasicProperties(delivery_mode=2),
        )
        conn.close()
        log.info("Queued -> %s  (tx: %s)", RABBITMQ_QUEUE, manifest.transaction_id)
        return True
    except Exception as exc:
        log.error("RabbitMQ publish failed: %s", exc)
        return False


# ── File processor (shared by startup scan + live watcher) ───────────────────

def process_file(filepath: str) -> None:
    """
    Move *filepath* to STORAGE_DIR, build a Manifest, and push to RabbitMQ.
    Safe to call from both the startup scan and the watchdog handler.
    """
    filename = os.path.basename(filepath)

    if not filename.lower().endswith(_ACCEPTED_EXT):
        return

    transaction_id = str(uuid.uuid4())
    new_filename = f"{transaction_id}_{filename}"
    new_filepath = os.path.join(STORAGE_DIR, new_filename)

    try:
        shutil.move(filepath, new_filepath)
        log.info("Moved  %s -> %s", filename, new_filepath)
    except Exception as exc:
        log.error("Could not move %s: %s", filename, exc)
        return

    manifest = Manifest(
        transaction_id=transaction_id,
        status="pending_forensic_ocr",
        image_paths=[new_filepath],
    )
    push_to_rabbitmq(manifest)


# ── Startup scan ──────────────────────────────────────────────────────────────

def startup_scan() -> int:
    """
    Process files already present in INGRESS_DIR before the observer starts.
    Returns the count of files processed.
    """
    files = [
        f for f in os.listdir(INGRESS_DIR)
        if os.path.isfile(os.path.join(INGRESS_DIR, f))
        and f.lower().endswith(_ACCEPTED_EXT)
    ]

    if not files:
        log.info("Startup scan: no pre-existing images found in %s", INGRESS_DIR)
        return 0

    log.info("Startup scan: found %d pre-existing image(s) — processing now...", len(files))
    for filename in files:
        filepath = os.path.join(INGRESS_DIR, filename)
        log.info("Startup scan processing: %s", filename)
        process_file(filepath)

    log.info("Startup scan complete: %d file(s) queued.", len(files))
    return len(files)


# ── Watchdog handler ──────────────────────────────────────────────────────────

class ImageHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return

        log.info("Detected new file: %s", os.path.basename(event.src_path))
        # Brief pause to allow scanner/OS to finish writing the file
        time.sleep(1)
        process_file(event.src_path)


# ── Entry point ───────────────────────────────────────────────────────────────

def start_monitor() -> None:
    log.info("=== Ingress Monitor starting ===")

    # 1. Drain files that arrived before this run
    queued = startup_scan()
    log.info("Post-scan summary: %d file(s) processed at startup.", queued)

    # 2. Start live observer
    handler = ImageHandler()
    observer = Observer()
    observer.schedule(handler, path=INGRESS_DIR, recursive=False)
    observer.start()
    log.info("Live observer started on %s", INGRESS_DIR)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Keyboard interrupt — stopping observer...")
    finally:
        observer.stop()
        observer.join()
        log.info("=== Ingress Monitor stopped ===")


if __name__ == "__main__":
    start_monitor()
