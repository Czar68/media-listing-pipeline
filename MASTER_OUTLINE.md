# MASTER_OUTLINE.md
> **Living document — auto-updated on every git push to main.**
> Every AI starting a session reads this file first. No prior context needed.

---

## 🟢 Current Status
**Active:** Phase 1 — Batch disc intake pipeline + eBay draft creation
**Constraint:** Cursor at ~6% usage remaining (7 days left). Windsurf is primary IDE. Anthropic API + Gemini Pro available directly.
**Immediate blocker:** ebay-scanner-v1.js handles single items only — needs batch mode before 10k disc processing can begin.

---

## 🔥 Active Work This Week
- [ ] Extend `ebay-scanner-v1.js` from single-item to batch
- [ ] Vision-based disc intake (disc labels, no barcodes — scanner rig already in use)
- [ ] Condition assignment layer (session-level default, per-item override)
- [ ] `draft_creator` — push to eBay as drafts only, never auto-publish
- [ ] MASTER_OUTLINE auto-update GitHub Action

---

## ✅ Completed

### Core Packages (TypeScript Monorepo — pnpm workspaces)
| Package | What It Does | Status |
|---|---|---|
| `core-domain` | Base types, no external deps | ✅ Complete |
| `core-condition` | Grading standards, defect taxonomy, completeness hashing | ✅ Complete |
| `core-identity` | Identity resolution, conflict types, no auto-select | ✅ Complete |
| `scan-ingestion` | Raw scan → normalized → candidates. Disc-only absorbed | ✅ Complete |
| `identity-application` | Operator resolution boundary, audit records | ✅ Complete |
| `ebay-scanner-v1.js` | Single-item deterministic listing compiler | ✅ Baseline (needs batch) |

---

## 📋 Project Map

### PROJECT 1: eBay Listing Pipeline
**Repo:** `Czar68/media-listing-pipeline`
**Goal:** 10k+ disc-only items → eBay drafts → human approves → publish

#### Phase 0 — Foundation (Complete)
- eBay developer account + production credentials
- Condition ID map (see Core Invariants)
- Item specifics map (Platform, Genre, Region, Rating — required by eBay category 139973)
- Fee-aware price formula: `min_price = (cost + shipping) / (1 - 0.1325)`
- SQLite tracking: `listings.db` (UPC → draft_id → status)
- Project file structure established

#### Phase 1 — Batch Intake + Draft Creation (🔥 Active)

**1.0 Intake Pipeline — Disc-Only at Scale**
- Multi-disc scanner rig (already in use — vision-based, not barcode)
- `vision_intake.py` — watches folder, sends disc images to Claude Vision, extracts title + platform
- `title_lookup.py` — fuzzy matches to IGDB/eBay Browse API, builds local cache
- Session-level condition default (`--condition disc_only_acceptable`)
- Per-scan condition override (keystroke)
- Unresolved queue → `unresolved_<session>.csv` with photo reference
- Output: `intake_queue.db` (every disc: identity, condition, metadata status)

**1.1 Pricing**
- eBay Browse API comps by title + platform
- Fee-aware floor price computed automatically
- Suggested price = median sold comp × 0.95
- Low confidence flagged (< 3 comps) for human review before drafting

**1.2 AI Listing Generator**
- Claude Sonnet: resolved GameItem → SEO title + description
- Title template: `[Platform] [Title] [Edition] - [Condition Signal]`
- Item specifics auto-populated from metadata
- All output logged to `artifacts/logs/listing_agent_<date>.json`

**1.3 Draft Creator (eBay Adapter)**
- Assembles full payload: condition + identity + price + AI copy
- Pushes to eBay as **draft only** — never auto-publish
- Writes `draft_id` back to `listings.db`
- Rate limiter built in (~5k API calls/day limit)
- Failures logged → `failed_drafts.csv`, retried once

**1.4 Review & Publish Loop**
- `draft_report` generates prioritized review file with: title, price, comp median, confidence, eBay draft link
- Human batch-approves in Seller Hub
- Status sync back to `listings.db`

#### Phase 2 — Bad Listing Detector (Queued)
- Pull all active listings
- Flag weak titles, bad pricing vs current comps
- Output prioritized fix report for batch editing in Seller Hub

#### Phase 3 — Arbitrage Engine (Queued)
- Scan buy-side sources (trade-in aggregators, lots)
- Compute margin after eBay fees
- Daily opportunity report
- Top items feed directly into Phase 1 listing agent queue

#### Phase 4 — Multi-Category + Batch Photo (Future)
- Retro games, handheld, DVDs, Blu-ray
- Batch photo workflows

#### Phase 5 — Sales Feedback Loop (Future)
- Auto-markdown suggestions
- Listing quality correlation analysis

#### Phase 6 — Overnight Worker (Future)
- GitHub Actions nightly cron
- Nightly scans, morning brief, queue auto-drafts

#### Phase 7 — Expansion (Deferred — do not architect for yet)
- Cross-marketplace: Mercari, Facebook
- Performance metrics dashboard

---

### PROJECT 2: AI Router
**Goal:** Intelligent task routing — right model, right prompt, right cost

#### Core Concept
The router's value is **not** the chat — it's what happens between the chat and the model call.

```
User speaks naturally
        ↓
Chat layer: extracts intent, task type, required context, constraints
        ↓
Router classifies: what kind of task is this actually?
        ↓
Router constructs: optimized structured prompt (not what user said — best input for target model)
        ↓
Router selects: cheapest model that can handle this well
        ↓
Model executes with a prompt it was designed to receive
```

#### Conversational Intake Layer (Missing Piece — to be added)
- Not a simple chat box — a structured intake that leads to prompt construction
- Clarifies ambiguity, fills required fields, enforces what downstream task needs
- What hits the model looks nothing like what you typed — it's structured, complete, optimized
- Example: "make a listing for this PS4 game" → router asks condition if unknown → sends fully structured `generate_game_listing` payload to model

#### Model Tier Strategy
| Tier | Model | Use For |
|---|---|---|
| Cheap | Gemini Pro | Listing copy, summaries, simple lookups |
| Smart | Claude Sonnet | Pricing math, complex logic, identity resolution |
| (Future) | Claude Opus | High-stakes decisions |

#### Router Components
- `route(task_type, payload)` → `{model, params}`
- Token cost logging per decision
- Conversational intake → structured prompt construction
- Chat layer that leads into the created prompt (not a pass-through)

---

### PROJECT 3: DFS Intelligence (Parallel Track)

#### Phase 1 — Backtest + Drift Detector
- Daily: yesterday's optimizer cards vs settled results
- Compute hit rate, EV, calibration error
- Drift warnings (e.g., "model overestimates rebounds by X% last 7 days")

#### Phase 2 — Intelligence Alerts (alert-only, no auto-bet)
- Poll props every N minutes
- Detect line moves ≥ 0.5, injury/usage situations
- Alert: player, move, historical hit rate in similar situations

#### Future
- Stake sizing suggestions (human approves)
- Full performance dashboard

---

## 🏗️ Infrastructure (Cross-Project)

### Overnight Worker
- GitHub Actions nightly cron
- Runs: eBay scans, DFS backtest, dashboard CSV refresh
- Morning brief generated on wakeup

### Repo Guardian (Planned)
- Pre-commit/CI diff analyzer
- Flags: too many files touched, EV/Kelly math changed without tests, missing MASTER_OUTLINE.md update

### MASTER_OUTLINE Auto-Update Action
- Triggers on every push to main
- Calls Claude API with: recent commits + diff + current MASTER_OUTLINE.md
- Claude updates only what changed
- Commits updated MASTER_OUTLINE.md back automatically

---

## 🔒 Core Invariants (Never Break These)
1. **No `ListingDraft` without `ConditionSignatureEvent`**
2. **No condition defaults or inference** — human assigned, blocking
3. **No marketplace logic in core packages**
4. **Burned discs block entirely**
5. **No auto-selection of identity ever**
6. **No auto-publish ever** (Phase 1 and beyond until explicitly decided)

---

## 📦 Condition Map
| Your Label | eBay `conditionId` | eBay Description |
|---|---|---|
| Disc Only Acceptable | 3000 | Disc only. May have scratches. Case and insert not included. |
| Used Very Good | 3000 | Disc in very good condition. Light scratches at most. Case/insert not included unless noted. |
| New | 1000 | Brand new, factory sealed. |

---

## 🔧 Tech Stack
- **Language:** TypeScript (monorepo, pnpm workspaces) + Python scripts for pipeline runners
- **UPC/Vision Lookup:** Claude Vision API + IGDB + eBay Browse API + local SQLite cache
- **AI Calls:** Anthropic API — `claude-sonnet-4` for listing generation and outline updates
- **Cheap Model:** Gemini Pro — summaries, copy, simple classification
- **Scheduler:** GitHub Actions nightly cron
- **DB:** SQLite (`listings.db`, `intake_queue.db`, `upc_cache.db`)
- **IDE:** Windsurf (primary), Cursor (use sparingly — ~6% remaining)

---

## 📁 File Structure
```
media-listing-pipeline/
├── MASTER_OUTLINE.md            ← This file. Read first.
├── config/
│   └── ebay_config.yaml         # API keys, policies, margin rules
├── data/
│   ├── listings.db              # Master: UPC → metadata → draft_id → status
│   ├── intake_queue.db          # Current scan session queue
│   ├── upc_cache.db             # Resolved UPC → title/platform/metadata
│   ├── condition_map.json
│   └── item_specifics_map.json
├── packages/                    # TypeScript monorepo packages
│   ├── core-domain/
│   ├── core-condition/
│   ├── core-identity/
│   ├── scan-ingestion/
│   └── identity-application/
├── scripts/
│   ├── ebay-scanner-v1.js       # Single-item listing compiler (needs batch)
│   ├── run_intake.py
│   ├── run_resolve.py
│   ├── run_price.py
│   ├── run_draft.py
│   └── run_report.py
├── src/
│   ├── ebay_client.py           # OAuth, API wrapper, rate limiter, retry
│   ├── vision_intake.py         # Disc photo → Claude Vision → title/platform
│   ├── title_lookup.py          # Fuzzy match → IGDB/eBay/local cache
│   ├── pricer.py                # Comps + fee-aware pricing
│   ├── listing_agent.py         # AI title/description generation
│   └── draft_creator.py        # Assembles + pushes eBay drafts
├── reports/
└── artifacts/
    └── logs/
```

---

## 📅 Changelog
| Date | What Changed |
|---|---|
| 2026-05-12 | Initial MASTER_OUTLINE.md created from session history. All projects, phases, invariants, and infrastructure documented. Router conversational intake layer added. |

---

## 🤖 Instructions for AI Agents Reading This File
1. Read this entire file before writing any code or making suggestions
2. Check **Current Status** and **Active Work** to know where to start
3. Never violate **Core Invariants**
4. Check **Completed** before building anything — don't rebuild what exists
5. All new work should fit into the phase structure or be added to **Queued**
6. After completing work, note what changed so the next agent knows
