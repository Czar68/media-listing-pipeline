# Media Listing Pipeline — Product Roadmap

Last updated: 2026-05-10
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

## Phase A — eBay sandbox validation (NEXT)
Goal: Prove EbayExecutor works against real eBay sandbox API.
- A-1: Configure sandbox OAuth credentials in .env
  (EBAY_CLIENT_ID_SANDBOX, EBAY_CLIENT_SECRET_SANDBOX, EBAY_REFRESH_TOKEN_SANDBOX,
  EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID,
  EBAY_MERCHANT_LOCATION_KEY)
- A-2: Run scripts/live-publish-verify.js with EXECUTION_MODE=sandbox
- A-3: Confirm listing appears in eBay sandbox seller hub
Entry: sandbox OAuth credentials obtained from eBay developer portal
Exit: one real sandbox listing created and visible in seller hub

## Phase B — Real S3 image hosting
Goal: Replace mock S3 with real image URLs for eBay listings.
- B-1: Configure AWS S3 or Cloudflare R2 credentials
- B-2: Update s3_client.py to use real SDK
- B-3: Confirm eBay listing shows real hosted image
Entry: Phase A complete
Exit: listing image URL is a real publicly accessible URL

## Phase C — End-to-end dry run
Goal: One disc through full pipeline without manual JSON editing.
- C-1: Drop image into data/ingress
- C-2: OCR → identity → condition input → listing → pricing → publish dry run
- C-3: Fix any broken seams found
Entry: Phase B complete
Exit: full pipeline runs clean on one real disc

## Phase D — Production publish
Goal: One real listing live on eBay.
- D-1: Set EBAY_ENV=production, EXECUTION_MODE=sandbox (still sandbox executor)
- D-2: Flip to real production credentials when sandbox validates
- D-3: Publish one listing, confirm live on eBay
Entry: Phase C complete
Exit: listing visible on eBay with correct title, condition, price, image

## Phase E — Condition input UI
Goal: Human condition grading without editing JSON manually.
- E-1: Simple web form or CLI for condition grading input
- E-2: Form writes ConditionSignatureEvent to manifest
- E-3: Pipeline unblocks automatically after grading
Entry: Phase C complete
Exit: human grades a disc via UI, pipeline continues automatically

## Phase F — Automation
Goal: No manual trigger needed for new discs.
- F-1: Ingress monitor runs as service, detects new images automatically
- F-2: End-to-end runs on schedule or file-drop trigger
- F-3: Discord/notification when listing goes live
Entry: Phase D complete
Exit: drop disc image, listing appears on eBay automatically

## Guardrails (never violated)
- No condition defaults or inference
- No marketplace logic in core packages
- Publish requires dry-run gate
- No silent mutation
- Production mode hard-blocked at executor boundary until Phase D
