# Archive notes

## Arbitrage Scanner — Technical Debt (Paused May 2026)

The **`ebay-arbitrage-scanner`** Compose service is **disabled** (entire block commented in `docker-compose.yml`). It was crashing after the Gemini SDK migration away from `google-generativeai`. The commented `command:` in Compose is a **placeholder** (`scripts/ebay_arbitrage_scanner.py`); point it at the real entry script when the scanner is restored.

**Requirements before re-enabling**

1. **SDK alignment:** Refactor the scanner entry point and any Gemini usage from **`google-generativeai`** to **`google-genai`**, following the same patterns as **`identity_worker`** / **`listing_worker`** (`genai.Client`, `client.models.generate_content`, normalised model ids via `core.logic.domain_config.normalize_gemini_model_id` / `GEMINI_MODEL` env where appropriate).
2. **Imports:** Audit the scanner’s main module (and any helpers using `os.path`) for a top-level **`import os`** so path bootstrapping cannot raise **`NameError`**.

See the `# TODO` above the commented service block in `docker-compose.yml` for the in-file reminder.
