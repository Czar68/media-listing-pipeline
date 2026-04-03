# REPO GUARDRAILS

Architecture:
- core-* packages cannot import adapters or apps
- eBay logic only in adapter-ebay
- no CSV as internal contract

Condition Rules:
- no defaults
- no inference
- no skipped fields
- no silent fallback

Safety:
- publish requires dry-run
- no silent mutation
- every override requires reason

Testing:
- every rule must have fixtures
