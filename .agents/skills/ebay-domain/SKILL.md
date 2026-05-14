---
name: ebay-domain
description: eBay API specifics, payload structure, rate limits, OAuth, and draft listing requirements. Load when building or modifying anything that touches eBay.
---

## API Details
- Environment: Production
- Auth: OAuth 2.0, user token for listing operations
- APIs: Trading API (CreateItem), Browse API (comps), Sell Feed API (Phase 4+)

## Rate Limits
- Standard tier: 5,000 calls/day
- Rate limiter in every API call — no direct fetches
- Retry: exponential backoff, max 3 attempts, then log to failed_drafts.csv

## Draft Listing Required Fields
Title: string (max 80 chars)
CategoryID: "139973" (hardcoded always)
ConditionID: "1000" or "3000" only
ConditionDescription: string
ItemSpecifics: Platform, Genre, Region Code, Rating (all 4 required)
StartPrice: number in USD
ListingType: "FixedPriceItem"
ListingDuration: "GTC"
Country: "US"
Currency: "USD"

## Pre-Draft Validation Checklist
- Title present and under 80 chars
- CategoryID = 139973
- ConditionID is "1000" or "3000" only
- All 4 ItemSpecifics present and non-empty
- Price >= floor_price
- Identity status = resolved
- ConditionSignatureEvent exists for this item
- No existing draft_id for this UPC in listings.db

## Never Do
- Call any endpoint that publishes, revises, or ends a live listing
- Hardcode API keys — always read from ebay_config.yaml
- Skip the rate limiter
- Call eBay from any package other than ebay-adapter
