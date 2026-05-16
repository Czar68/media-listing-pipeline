# Media Listing Pipeline — Product Roadmap

Last updated: 2026-05-16
Current focus: MLB-first physical media listing to eBay production
Branch: main

## Final product vision

Fully automated pipeline: drop a disc image → OCR identity → human condition 
grading → AI listing generation → pricing → publish to eBay with real images.
Zero manual steps except condition grading (by design — no defaults allowed).

## What is built (2026-05-10)

- core-domain, core-condition — COMPLETE (13 oracle tests passing)
- Docker stack — 4 workers, Postgres, RabbitMQ — COMPLETE
- OCR via Gemini Flash → identity worker — COMPLETE
- Listing generation via Gemini Pro — COMPLETE
- eBay adapter with dry_run toggle — COMPLETE
- Pricing oracle with profit floor — COMPLETE
- Image ingestion via watchdog → S3 mock — COMPLETE
- Pluggable executor: MockExecutor, EbayExecutor (sandbox), production blocked — COMPLETE
- Master dashboard script — COMPLETE
- Resilient RabbitMQ connections with backoff — COMPLETE

## Phase A-3 — Enrichment & Listing Quality

Goal: Sandbox listings contain real, sellable data before batch publish is attempted.

- A-3-1: Wire epidEnricher.ts to real eBay catalog API; key on UPC; pull Platform, Genre, Publisher, Rating, Release Year
- A-3-2: Real pricing from eBay sold listings (90-day window, median of completed sales)
- A-3-3: HTML description template for category 139973 (Video Games)
- A-3-4: SKU logic — {UPC}-A primary, {platform_code}-A fallback when no UPC
- A-3-5: Best Offer — enable on listings ≥$15; floor = acquisition + fees + shipping + ad rate; auto-accept = midpoint of floor and list price
- A-3-6: Duplicate detection — on publish, check for existing active listing by SKU/UPC; increment quantity instead of creating duplicate

Entry: Phase A-2 complete (sandbox publish verified, VERDICT: PASS)
Exit: sandbox listing contains real item specifics, real price, correct SKU, Best Offer configured

## Phase A-4 — Image Pipeline

Goal: Listings show real hosted images, not mock URLs.

- A-4-1: Fix image crop attachment — processed images must attach to listing payload, not just be referenced by path
- A-4-2: Configure AWS S3 or Cloudflare R2 credentials
- A-4-3: Update s3_client.py to use real SDK
- A-4-4: Confirm sandbox listing shows real publicly accessible image URL

Entry: Phase A-3 complete
Exit: listing image is a real hosted URL visible on sandbox eBay item page

## Phase A-5 — End-to-End Batch Dry Run

Goal: All 94 READY_TO_PUBLISH drafts publish cleanly in sandbox.

- A-5-1: Batch publish from data/drafts/ with --limit safety gate
- A-5-2: Full pipeline runs clean on real disc data
- A-5-3: Fix any broken seams found; re-run until clean

Entry: Phase A-4 complete
Exit: batch of real disc drafts published to sandbox with correct titles, prices, images, and item specifics

## Phase B — Condition Input UI

Goal: Human condition grading without editing JSON manually.

- B-1: Simple web form or CLI for condition grading input
- B-2: Form writes ConditionSignatureEvent to manifest
- B-3: Pipeline unblocks automatically after grading

Entry: Phase A-5 complete
Exit: human grades a disc via UI, pipeline continues automatically

## Phase C — Production Publish

Goal: One real listing live on eBay.

- C-1: Flip to production credentials; set EXECUTION_MODE=production
- C-2: Publish one listing, confirm live on eBay with correct title, condition, price, image
- C-3: Publish gate requires Phase A-5 batch to have passed clean

Entry: Phase B complete
Exit: listing visible on production eBay

## Phase D — Automation

Goal: No manual trigger needed for new discs.

- D-1: Ingress monitor runs as service, detects new images automatically
- D-2: End-to-end runs on schedule or file-drop trigger
- D-3: Discord or webhook notification when listing goes live

Entry: Phase C complete
Exit: drop disc image, listing appears on eBay automatically

## Guardrails (never violated)

- No condition defaults or inference
- No marketplace logic in core packages
- Publish requires dry-run gate
- No silent mutation
- Production mode hard-blocked at executor boundary until Phase C
