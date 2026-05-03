"""
scripts/ingress_orchestrator_v3.py
────────────────────────────────────
Ingress Orchestrator v3 — Disc-Only Video Games
================================================

Responsibilities
────────────────
1. BACKLOG SWEEP   — drain data/storage/raw/ first (29 existing batches),
                     then drain data/ingress/ (new marathon scans).
2. LIVE WATCH      — watchdog observer on data/ingress/ for new arrivals.
3. UUID PRIMARY KEY — every file is renamed to <UUIDv4><ext> immediately on
                     detection. The UUID is the immutable disc primary key.
4. PERSISTENT CONN — one long-lived pika.BlockingConnection; a reconnect()
                     strategy handles idle gaps between scanning sessions.
5. CLASSIFICATION  — condition hardcoded to "Used - Acceptable" (eBay ID 7000).
6. STABILIZATION   — 1 s delay before moving any file to ensure the scanner
                     has finished writing.

Environment variables
─────────────────────
  RABBITMQ_HOST  — defaults to 'rabbitmq'   (Docker service name)
  RABBITMQ_QUEUE — defaults to 'manifest_pipeline_v2'
  INGRESS_DIR    — defaults to <repo>/data/ingress
  RAW_DIR        — defaults to <repo>/data/storage/raw

Exclusions
──────────
  data/drafts/ is never touched (code-level guard + .gitignore).
"""

import logging
import os
import re
import shutil
import socket
import sys
import time
import uuid as _uuid_mod

import pika
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

# ── Path bootstrap ─────────────────────────────────────────────────────────────
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from core.ingestor.schema import Manifest

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("ingress_v3")

# ── Configuration ──────────────────────────────────────────────────────────────
RABBITMQ_HOST  = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "manifest_pipeline_v2")

_default_ingress = os.path.join(ROOT_DIR, "data", "ingress")
_default_raw     = os.path.join(ROOT_DIR, "data", "storage", "raw")
INGRESS_DIR = os.getenv("INGRESS_DIR", _default_ingress)
RAW_DIR     = os.getenv("RAW_DIR",     _default_raw)
DRAFTS_DIR  = os.path.join(ROOT_DIR, "data", "drafts")   # never touched

ACCEPTED_EXT        = (".jpg", ".jpeg", ".png")
EBAY_CONDITION_ID   = 7000          # "Used - Acceptable"
EBAY_CONDITION_LABEL = "Used - Acceptable"
STABILIZATION_DELAY = 1.0           # seconds — wait for scanner to close file

os.makedirs(INGRESS_DIR, exist_ok=True)
os.makedirs(RAW_DIR,     exist_ok=True)

log.info("RABBITMQ_HOST  = %s", RABBITMQ_HOST)
log.info("RABBITMQ_QUEUE = %s", RABBITMQ_QUEUE)
log.info("INGRESS_DIR    = %s", INGRESS_DIR)
log.info("RAW_DIR        = %s", RAW_DIR)
log.info("DRAFTS_DIR     = %s (excluded)", DRAFTS_DIR)

# ── UUID helpers ───────────────────────────────────────────────────────────────
_UUID_RE = re.compile(
    r"^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


def extract_uuid(filename: str) -> str | None:
    """Return the leading UUID if the filename is already UUID-prefixed."""
    m = _UUID_RE.match(filename)
    return m.group(1) if m else None


def extract_title_hint(filename: str) -> str:
    """
    Best-effort disc title extraction from a filename.
    Strips the UUID prefix (if present), the extension, and timestamp noise.
    Example: '3ce2a77e_game_2026-05-03_11-24-12.jpg' -> 'game 2026-05-03 11-24-12'
    """
    stem = os.path.splitext(filename)[0]
    # Strip leading UUID
    stem = _UUID_RE.sub("", stem).lstrip("_- ")
    # Replace underscores with spaces
    return stem.replace("_", " ").strip() or "Unknown"


def ensure_uuid_filename(filepath: str) -> tuple[str, str]:
    """
    Guarantee the file has a UUID primary-key prefix.
    If already UUID-prefixed, return (existing_uuid, filepath) unchanged.
    Otherwise rename to <uuid><ext> in-place and return (new_uuid, new_path).
    """
    directory = os.path.dirname(filepath)
    filename  = os.path.basename(filepath)
    ext       = os.path.splitext(filename)[1].lower()

    existing_uuid = extract_uuid(filename)
    if existing_uuid:
        return existing_uuid, filepath

    new_uuid     = str(_uuid_mod.uuid4())
    new_filename = f"{new_uuid}{ext}"
    new_filepath = os.path.join(directory, new_filename)
    os.rename(filepath, new_filepath)
    log.info("UUID assigned: %s  ->  %s", filename, new_filename)
    return new_uuid, new_filepath


# ── Persistent RabbitMQ connection ─────────────────────────────────────────────
class ResilientPublisher:
    """
    Wraps a long-lived pika.BlockingConnection with automatic reconnect().

    reconnect() is called:
      - on first use
      - whenever a publish attempt detects a closed channel/connection
      - on any pika exception during publish
    """

    _MAX_RETRIES  = 15
    _BASE_DELAY   = 5      # seconds
    _CAP_DELAY    = 15     # seconds

    def __init__(self):
        self._conn    = None
        self._channel = None

    # ── Internal ──────────────────────────────────────────────────────────────

    def _is_open(self) -> bool:
        return (
            self._conn is not None
            and self._conn.is_open
            and self._channel is not None
            and self._channel.is_open
        )

    def _connect_once(self) -> bool:
        """Single attempt to open a fresh connection + channel."""
        try:
            params = pika.ConnectionParameters(
                host=RABBITMQ_HOST,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            self._conn    = pika.BlockingConnection(params)
            self._channel = self._conn.channel()
            self._channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
            log.info("RabbitMQ connected to '%s' on queue '%s'", RABBITMQ_HOST, RABBITMQ_QUEUE)
            return True
        except (
            pika.exceptions.AMQPConnectionError,
            ConnectionRefusedError,
            socket.gaierror,
            OSError,
        ) as exc:
            log.warning("RabbitMQ connect attempt failed: %s", exc)
            return False

    def reconnect(self):
        """Block until connected, with capped exponential backoff."""
        if self._is_open():
            return

        log.info("Reconnecting to RabbitMQ...")
        for attempt in range(1, self._MAX_RETRIES + 1):
            if self._connect_once():
                return
            delay = min(self._BASE_DELAY * attempt, self._CAP_DELAY)
            log.warning(
                "Attempt %d/%d failed. Retrying in %ds...",
                attempt, self._MAX_RETRIES, delay,
            )
            time.sleep(delay)

        log.error("FATAL: could not connect to RabbitMQ after %d attempts.", self._MAX_RETRIES)
        sys.exit(1)

    # ── Public ────────────────────────────────────────────────────────────────

    def publish(self, manifest: Manifest) -> bool:
        """
        Publish manifest to the queue.
        Automatically reconnects if the connection has gone stale.
        Returns True on success.
        """
        if not self._is_open():
            self.reconnect()

        try:
            self._channel.basic_publish(
                exchange="",
                routing_key=RABBITMQ_QUEUE,
                body=manifest.model_dump_json(),
                properties=pika.BasicProperties(delivery_mode=2),
            )
            log.info(
                "Queued -> %s  (tx: %s | %s)",
                RABBITMQ_QUEUE,
                manifest.transaction_id,
                manifest.identity.get("title_hint", ""),
            )
            return True
        except Exception as exc:
            log.warning("Publish failed (%s). Reconnecting...", exc)
            self._conn    = None
            self._channel = None
            self.reconnect()
            # Retry once after reconnect
            try:
                self._channel.basic_publish(
                    exchange="",
                    routing_key=RABBITMQ_QUEUE,
                    body=manifest.model_dump_json(),
                    properties=pika.BasicProperties(delivery_mode=2),
                )
                return True
            except Exception as exc2:
                log.error("Publish retry failed: %s", exc2)
                return False

    def close(self):
        if self._conn and self._conn.is_open:
            self._conn.close()


# Singleton publisher — shared across startup scan + watchdog
_publisher = ResilientPublisher()


# ── Core disc processor ────────────────────────────────────────────────────────

def process_disc(filepath: str, source_label: str = "ingress") -> bool:
    """
    Full ingestion pipeline for a single disc image file.

      1. Stabilization delay (scanner file-close guard)
      2. UUID primary-key assignment / extraction
      3. Move to RAW_DIR (if not already there)
      4. Build Manifest with eBay condition metadata
      5. Publish to RabbitMQ

    Explicitly excludes anything under DRAFTS_DIR.
    Returns True on successful queue insertion.
    """
    # Hard exclusion — drafts are never touched
    if DRAFTS_DIR in os.path.abspath(filepath):
        log.debug("Skipping drafts file: %s", filepath)
        return False

    filename = os.path.basename(filepath)

    if not filename.lower().endswith(ACCEPTED_EXT):
        return False

    # 1. Stabilization delay
    time.sleep(STABILIZATION_DELAY)

    if not os.path.isfile(filepath):
        log.warning("File disappeared before processing: %s", filename)
        return False

    # 2. UUID primary-key assignment
    disc_uuid, filepath = ensure_uuid_filename(filepath)
    filename = os.path.basename(filepath)

    # 3. Move to RAW_DIR (only if not already there)
    if os.path.abspath(os.path.dirname(filepath)) != os.path.abspath(RAW_DIR):
        dest = os.path.join(RAW_DIR, filename)
        try:
            shutil.move(filepath, dest)
            log.info("[%s] Moved -> raw: %s", source_label, filename)
            filepath = dest
        except Exception as exc:
            log.error("Move failed for %s: %s", filename, exc)
            return False

    # 4. Build manifest
    title_hint = extract_title_hint(filename)

    manifest = Manifest(
        transaction_id=disc_uuid,
        status="pending_forensic_ocr",
        raw_identifier=disc_uuid,
        image_paths=[filepath],
        identity={
            "title": None,
            "title_hint": title_hint,
            "format": "Game Disc",
            "confidence": 0.0,
            "metadata_source": "gemini-1.5-flash",
            # eBay condition — hardcoded for disc-only used games
            "ebay_condition_id": EBAY_CONDITION_ID,
            "ebay_condition_label": EBAY_CONDITION_LABEL,
        },
        financials={"listing_price": 0.0, "ebay_fees": 0.0, "shipping_cost": 0.0, "net_profit": 0.0},
        flags={"human_review_required": True, "conflict_detected": False, "is_lot": False},
    )

    # 5. Publish
    return _publisher.publish(manifest)


# ── Startup sweeps ─────────────────────────────────────────────────────────────

def sweep_directory(directory: str, label: str) -> int:
    """
    Process every accepted image file in *directory*.
    Returns the count of files successfully queued.
    """
    if not os.path.isdir(directory):
        log.warning("Directory not found, skipping sweep: %s", directory)
        return 0

    candidates = sorted(
        f for f in os.listdir(directory)
        if os.path.isfile(os.path.join(directory, f))
        and f.lower().endswith(ACCEPTED_EXT)
    )

    if not candidates:
        log.info("[%s] Sweep: no images found.", label)
        return 0

    log.info("[%s] Sweep: found %d image(s). Processing...", label, len(candidates))
    queued = 0
    for filename in candidates:
        filepath = os.path.join(directory, filename)
        if process_disc(filepath, source_label=label):
            queued += 1

    log.info("[%s] Sweep complete: %d/%d queued.", label, queued, len(candidates))
    return queued


# ── Watchdog handler ───────────────────────────────────────────────────────────

class DiscImageHandler(FileSystemEventHandler):
    """Live watchdog — picks up new files dropped into INGRESS_DIR."""

    def on_created(self, event):
        if event.is_directory:
            return
        filepath = event.src_path
        filename = os.path.basename(filepath)
        if filename.lower().endswith(ACCEPTED_EXT):
            log.info("[live] Detected: %s", filename)
            process_disc(filepath, source_label="live")


# ── Entry point ────────────────────────────────────────────────────────────────

def run():
    log.info("=== Ingress Orchestrator v3 starting (Disc-Only Video Games) ===")
    log.info("eBay condition: %s (ID %d)", EBAY_CONDITION_LABEL, EBAY_CONDITION_ID)

    # Establish persistent connection before any sweeps
    _publisher.reconnect()

    # Phase 1: drain existing batches in raw/
    raw_count = sweep_directory(RAW_DIR, label="raw-backlog")
    log.info("Phase 1 done: %d disc(s) from raw backlog queued.", raw_count)

    # Phase 2: drain pending files in ingress/
    ingress_count = sweep_directory(INGRESS_DIR, label="ingress-backlog")
    log.info("Phase 2 done: %d disc(s) from ingress backlog queued.", ingress_count)

    log.info("Total startup: %d disc(s) queued.", raw_count + ingress_count)

    # Phase 3: start live observer on ingress/
    handler  = DiscImageHandler()
    observer = Observer()
    observer.schedule(handler, path=INGRESS_DIR, recursive=False)
    observer.start()
    log.info("Live observer started on: %s", INGRESS_DIR)
    log.info("Waiting for new disc scans... (Ctrl+C to stop)")

    try:
        while True:
            time.sleep(1)
            # Heartbeat reconnect check — keeps connection alive during idle gaps
            if not _publisher._is_open():
                log.warning("Connection lost during idle. Reconnecting...")
                _publisher.reconnect()
    except KeyboardInterrupt:
        log.info("Keyboard interrupt received.")
    finally:
        observer.stop()
        observer.join()
        _publisher.close()
        log.info("=== Ingress Orchestrator v3 stopped ===")


if __name__ == "__main__":
    run()
