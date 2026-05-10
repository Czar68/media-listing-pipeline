# Session Handoff — Re-orientation Prompt

Paste this into Claude at the start of any new session:

---
I am continuing work on media-listing-pipeline on the main branch.
Read these files in order:
1. README.md
2. REPO_GUARDRAILS.md
3. .skills/media-listing-pipeline/SKILL.md
4. docs/PRODUCT_ROADMAP.md
5. PROJECT_STATE.md (last 50 lines only)

Report: current phase, last completed work, next task, any blockers.
Do not write any code. Wait for my instruction.

Current known state (2026-05-10):
- All work merged to main from feature/unified-orchestration-v3
- Pluggable executor complete: MockExecutor, EbayExecutor (sandbox), production blocked
- EXECUTION_MODE env var drives routing
- Full roadmap: docs/PRODUCT_ROADMAP.md
- Next phase: Phase A-1 — configure eBay sandbox OAuth credentials
- Credentials needed: EBAY_CLIENT_ID_SANDBOX, EBAY_CLIENT_SECRET_SANDBOX,
  EBAY_REFRESH_TOKEN_SANDBOX, EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID,
  EBAY_RETURN_POLICY_ID, EBAY_MERCHANT_LOCATION_KEY
---
