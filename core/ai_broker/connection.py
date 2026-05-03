"""
core/ai_broker/connection.py
Resilient RabbitMQ connection helper for all pipeline workers.

Root-cause background
─────────────────────
The original retry loops only caught pika.exceptions.AMQPConnectionError.
During the brief window between Docker network up and service ready, Python
raises socket.gaierror (a subclass of OSError) when DNS resolution of the
service hostname fails — this bypassed the retry entirely and crashed workers.

This helper catches the full exception surface:
  • socket.gaierror          – DNS not yet resolved (service name not in DNS)
  • ConnectionRefusedError   – port not yet accepting connections
  • pika.exceptions.AMQPConnectionError – AMQP-level rejection
  • OSError (parent)         – any other network-layer failure

It uses capped exponential backoff: 5 s → 10 s → 15 s → 15 s (cap).
"""

import time
import sys
import socket
import pika

_MAX_RETRIES = 15
_BASE_DELAY_S = 5
_CAP_DELAY_S = 15


def connect_with_retry(host: str, worker_name: str) -> pika.BlockingConnection:
    """
    Attempt to establish a BlockingConnection to RabbitMQ on `host`.
    Retries up to _MAX_RETRIES times with capped exponential backoff.
    Exits the process if all retries are exhausted.

    Args:
        host:        RabbitMQ hostname (Docker service name, e.g. "rabbitmq").
        worker_name: Friendly label for log messages.

    Returns:
        An open pika.BlockingConnection.
    """
    print(f" [{worker_name}] Connecting to RabbitMQ at '{host}'...")

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            params = pika.ConnectionParameters(
                host=host,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            conn = pika.BlockingConnection(params)
            print(f" [{worker_name}] Connected to RabbitMQ on attempt {attempt}.")
            return conn

        except (
            pika.exceptions.AMQPConnectionError,
            ConnectionRefusedError,
            socket.gaierror,  # DNS not yet resolved — the primary gaierror fix
            OSError,
        ) as exc:
            delay = min(_BASE_DELAY_S * attempt, _CAP_DELAY_S)
            print(
                f" [{worker_name}] Connection attempt {attempt}/{_MAX_RETRIES} failed "
                f"({type(exc).__name__}: {exc}). Retrying in {delay}s..."
            )
            time.sleep(delay)

    print(f" [{worker_name}] FATAL: Could not connect to RabbitMQ after {_MAX_RETRIES} attempts. Exiting.")
    sys.exit(1)
