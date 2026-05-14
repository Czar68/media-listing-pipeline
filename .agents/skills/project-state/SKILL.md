---
name: project-state
description: Full project context, phase map, invariants, and current status. Load when starting any new task, reviewing architecture, or orienting in a new session.
---

When this skill loads, read MASTER_OUTLINE.md before proceeding. Then read PROJECT_STATE.md.

## Project Identity
Repo: media-listing-pipeline
Stack: TypeScript, pnpm monorepo
Mission: 10,000+ disc-only media items into profitable eBay listings with minimal manual work

## Pipeline (End to End)
Physical disc -> scan station
-> scan-ingestion (raw scan -> normalized -> candidates)
-> identity-application (human resolves conflicts)
-> core-condition (human assigns condition — blocking)
-> pricer (eBay comps -> fee-aware price)
-> listing-agent (Claude API -> SEO title + description)
-> ebay-adapter (assemble payload -> push DRAFT only)
-> Human reviews in Seller Hub -> publishes

## Condition Types
| Label                | conditionId | Description                                         |
|----------------------|-------------|-----------------------------------------------------|
| Disc Only Acceptable | 3000        | Disc only. May have scratches. No case or insert.   |
| Used Very Good       | 3000        | Very good condition. Case/insert included unless noted. |
| New                  | 1000        | Factory sealed.                                     |

## Fee Formula
floor_price     = (cost + shipping_out) / (1 - 0.1325)
target_price    = median_sold_comp x 0.95
suggested_price = max(floor_price, target_price)

## Required eBay Item Specifics
Platform, Genre, Region Code, Rating
Category ID: 139973

## Never Violate
- No draft without ConditionSignatureEvent
- No condition inference — human assigned, blocking
- No auto-publish ever
- No eBay logic outside ebay-adapter
- Burned discs block pipeline entirely
