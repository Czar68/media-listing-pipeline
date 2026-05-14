# ANTIGRAVITY COMPLETE SETUP GUIDE
## media-listing-pipeline | Phase 1 Sprint
## Read MASTER_OUTLINE.md before opening Antigravity

---

# PART 1 — SETTINGS
## Do this before opening any agent session

### 1.1 Agent Behavior Policies
`Settings (Cmd+,) → Agent`

| Setting | Value | Why |
|---|---|---|
| Artifact Review Policy | Asks for Review | You approve every implementation plan before code is written |
| Terminal Command Auto Execution | Request Review | No agent runs shell commands without your OK |
| Enable Terminal Sandbox | ON | Isolates terminal from your system |
| Agent Non-Workspace File Access | OFF | Agents stay inside the repo only |
| JavaScript Execution Policy | Request Review | Browser agent asks before running JS |
| Default Agent Mode | Review-driven | Plan → approve → code → review diff. Never Agent-driven. |

---

### 1.2 Always Allow List
`Settings → Agent → Permissions → Always Allow`

```
command(git)
command(npm)
command(npx)
command(node)
command(pnpm)
command(tsc)
command(ls)
command(cat)
command(mkdir)
command(cp)
command(mv)
read_url(api.ebay.com)
read_url(api.sandbox.ebay.com)
read_url(api.igdb.com)
read_url(api.upcitemdb.com)
read_url(api.anthropic.com)
```

---

### 1.3 Always Deny List
`Settings → Agent → Permissions → Always Deny`

```
command(rm)
command(drop)
write_file(/data/listings.db)
write_file(/config/ebay_config.yaml)
```

---

### 1.4 Browser URL Allowlist
`Settings → Browser → URL Allowlist`

```
api.ebay.com
api.sandbox.ebay.com
developer.ebay.com
api.igdb.com
api.upcitemdb.com
api.anthropic.com
antigravity.google
```

---

### 1.5 Model Allotment Strategy
You have 3 separate pools. Treat them as separate budgets.

| Pool | Use For | Never Use For |
|---|---|---|
| Gemini Pro | Architecture, multi-package design, Planning mode | Boilerplate, iteration, copy |
| Claude Sonnet | Pricing logic, eBay payload, financial math, security-sensitive code | Simple scripts, config files |
| Gemini Flash | Everything else — tests, config, copy, iteration, simple fixes | Any task with financial consequences |

**Rule:** Always start a new task in Fast mode with Flash. Escalate only if Flash fails or the task is financial/architectural.

**Hard limits:**
- Max 1 Gemini Pro agent at a time
- Max 2 Sonnet agents at a time
- Flash agents can fill remaining slots

---

# PART 2 — REPO SETUP
## Run once in repo root before first session

```bash
mkdir -p .agents/rules
mkdir -p .agents/workflows
mkdir -p .agents/skills/project-state
mkdir -p .agents/skills/ebay-domain
mkdir -p .agents/skills/code-standards
mkdir -p config
mkdir -p data
mkdir -p reports
mkdir -p artifacts/logs
```

---

# PART 3 — RULES FILES
## Permanent. Every agent reads these automatically every session.

---

### `.agents/rules/core-invariants.md`

```markdown
# Core Invariants — Never Violate

## Pipeline Integrity
- No ListingDraft without a ConditionSignatureEvent. Period.
- No condition inference or defaults. Condition is human-assigned and blocking.
- No marketplace (eBay) logic inside core-domain, core-condition, or core-identity.
- Burned discs block the entire pipeline. No exceptions.
- No auto-selection of identity when multiple candidates exist.

## eBay Safety
- Agents may ONLY create DRAFT listings. Never publish. Never auto-publish.
- No API call that spends money or modifies live listings without human approval.
- Price must be within configured margin band vs median sold comp before any draft.
- No draft created without: resolved identity + assigned condition + priced item.

## Data Integrity
- listings.db is the master record. No agent writes to it except through db-client.
- All agent outputs logged to artifacts/logs/ with timestamp and input snapshot.
- Duplicate UPC check required before creating any draft.
- All external API calls go through ebay-adapter with rate limiter. Never call eBay directly.

## Code Integrity
- TypeScript strict mode. No `any` types in core packages.
- No agent merges its own PR. Humans merge only.
- MASTER_OUTLINE.md updated after any phase completion.
- Tests required for any function touching pricing math or condition logic.
```

---

### `.agents/rules/model-usage.md`

```markdown
# Model Usage Rules — Protect Allotments

## Default
Always start in Fast mode with Gemini Flash.
Escalate only when task is complex or Flash has failed twice.

## Gemini Pro (Planning Mode Only)
Use when:
- Designing a new module from scratch touching multiple packages
- Any architecture decision not already in MASTER_OUTLINE.md
- Complex multi-file refactors
- Flash has failed or produced structurally wrong output twice

## Claude Sonnet
Use when:
- Pricing formula logic — must be exact
- eBay API payload assembly — mistakes cost money
- Any function where a subtle bug corrupts listings data
- Reviewing diffs before merge on financial or identity logic

## Gemini Flash (Fast Mode)
Use when:
- Boilerplate, scaffolding, renaming, reformatting
- Writing or fixing tests
- JSON and config files
- Iterating on listing copy prompts
- Scripts that run once
- Any well-defined single-file task

## Hard Rules
- Never run more than 1 Gemini Pro agent simultaneously
- Never run more than 2 Sonnet agents simultaneously
- Flash can fill all remaining agent slots
- When unsure: use Flash first
```

---

### `.agents/rules/repo-structure.md`

```markdown
# Repository Structure Rules

## Package Boundaries — Never Cross
- core-domain: base types only, zero external dependencies
- core-condition: grading engine, no eBay knowledge
- core-identity: identity resolution, no condition or eBay knowledge
- scan-ingestion: intake pipeline, no pricing or listing logic
- identity-application: operator boundary, audit records only
- ebay-adapter: ALL eBay API logic lives here and ONLY here

## File Ownership Per Session
- One agent owns one package or module at a time
- No two agents write to the same file simultaneously
- If a file needs changes from two agents, one waits for the other to merge first

## Required Per Package
- index.ts (exports only)
- types.ts (types for that package)
- __tests__/ directory with at least one test file

## Config Files — Human Controlled, Never Agent Modified
- config/ebay_config.yaml
- .env files
- data/listings.db (use db-client wrapper only)
```

---

# PART 4 — WORKFLOWS
## Triggered with `/workflow-name` in any agent session

---

### `.agents/workflows/morning-check.md`

```markdown
---
name: morning-check
description: Start of day orientation. Read project state and tell me exactly where to focus.
---

1. Read MASTER_OUTLINE.md in full
2. Read PROJECT_STATE.md
3. List any open PRs or uncommitted changes
4. Read the last 5 git commits
5. Tell me:
   - Exactly where we are in the current phase
   - The single highest priority task today
   - Which model tier to use for that task
   - Which 5 agents to spin up and with what tasks
   - Any blockers that need human decisions before agents can proceed
```

---

### `.agents/workflows/review-diff.md`

```markdown
---
name: review-diff
description: Review current code diff before merge. Check for invariant violations.
---

Review the current diff against:
1. Does any change touch pricing math without a corresponding test change?
2. Does any change modify core-condition or core-identity without updating types.ts?
3. Is there any direct eBay API call outside of the ebay-adapter package?
4. Is there any place where condition could be inferred or defaulted?
5. Are there any `any` types introduced in core packages?
6. Does listings.db get written directly instead of through db-client?
7. Does MASTER_OUTLINE.md need updating based on what was completed?

Report each violation with file name and line number.
If no violations: confirm the diff is clean and clear to merge.
```

---

### `.agents/workflows/update-project-state.md`

```markdown
---
name: update-project-state
description: Update MASTER_OUTLINE.md and PROJECT_STATE.md after completing a phase or major task.
---

1. Read MASTER_OUTLINE.md
2. Read PROJECT_STATE.md
3. Read the last 10 git commits
4. Update PROJECT_STATE.md:
   - Current status (one line)
   - What was just completed
   - What is actively in progress
   - Next 3 concrete tasks with model tier recommendation
5. Update MASTER_OUTLINE.md:
   - Mark completed items ✅
   - Add any newly discovered tasks to the correct phase
   - Add changelog entry with today's date and what changed
6. Commit both: "docs: update project state [automated]"
```

---

### `.agents/workflows/generate-tests.md`

```markdown
---
name: generate-tests
description: Generate tests for the current file or package.
---

Generate comprehensive tests for the specified file:
1. Unit tests for every exported function
2. Edge cases: empty input, null, malformed data
3. Pricing functions: test boundary conditions and fee formula
4. eBay adapter: mock the API call, test payload structure exactly
5. Condition logic: test all 3 condition types and blocking behavior
6. Name test files matching source file with .test.ts suffix
7. All tests must pass before marking task complete
```

---

# PART 5 — SKILLS
## Load automatically when task description matches

---

### `.agents/skills/project-state/SKILL.md`

```markdown
---
name: project-state
description: Full project context, phase map, invariants, and current status. Load when starting any new task, reviewing architecture, or orienting in a new session.
---

When this skill loads, read MASTER_OUTLINE.md before proceeding. Then read PROJECT_STATE.md.

## Project Identity
Repo: media-listing-pipeline
Stack: TypeScript, pnpm monorepo
Mission: 10,000+ disc-only media items → profitable eBay listings with minimal manual work

## Pipeline (End to End)
Physical disc → scan station
→ scan-ingestion (raw scan → normalized → candidates)
→ identity-application (human resolves conflicts)
→ core-condition (human assigns condition — blocking)
→ pricer (eBay comps → fee-aware price)
→ listing-agent (Claude API → SEO title + description)
→ ebay-adapter (assemble payload → push DRAFT only)
→ Human reviews in Seller Hub → publishes

## Condition Types
| Label | conditionId | Description |
|---|---|---|
| Disc Only Acceptable | 3000 | Disc only. May have scratches. No case or insert. |
| Used Very Good | 3000 | Very good condition. Case/insert included unless noted. |
| New | 1000 | Factory sealed. |

## Fee Formula
floor_price = (cost + shipping_out) / (1 - 0.1325)
target_price = median_sold_comp × 0.95
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
```

---

### `.agents/skills/ebay-domain/SKILL.md`

```markdown
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

## Draft Listing Payload (Required Fields)
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
Agent must confirm ALL before calling CreateItem:
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
```

---

### `.agents/skills/code-standards/SKILL.md`

```markdown
---
name: code-standards
description: TypeScript standards and patterns for this codebase. Load when writing or reviewing code.
---

## TypeScript
- Strict mode always
- No `any` in core packages
- Explicit return types on all exported functions
- Zod for runtime validation on all external data

## Error Handling
- All errors are typed — no throwing raw strings
- External API failures: log, add to failed queue, continue pipeline
- One failed item never stops the batch

## Naming
- Files: kebab-case
- Types/Interfaces: PascalCase
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Database fields: snake_case

## Package Pattern
- Exports only from index.ts
- Internal modules not exported
- Types crossing package boundaries live in core-domain

## Logging
- All agent output: artifacts/logs/<module>_<date>.json
- Structure: { timestamp, input_snapshot, output, model_used, tokens_used }
- Failed items: reports/failed_<module>_<date>.csv with reason column
```

---

# PART 6 — THE 5 AGENT PROMPTS
## Open Agent Manager. One prompt per agent conversation.
## Launch order: Agent 4 → Agent 5 → Agent 2 → Agent 3 → Agent 1
## Stagger by 5 minutes so you're not reviewing 5 plans at once.

---

## AGENT 1 — Gemini Pro | Planning Mode
### Label: `intake-pipeline`

```
Read MASTER_OUTLINE.md and PROJECT_STATE.md first.
Load the project-state skill and code-standards skill.

Your task: Design and scaffold the batch intake pipeline for Phase 1.

Context:
- 10,000+ disc-only game items to process
- scan-ingestion package already handles single disc: raw scan → normalized → candidates
- Need to extend for batch sessions with session-level condition assignment
- All 3 condition types: "disc_only_acceptable" | "used_very_good" | "new"

Build in this order. Show me the implementation plan for each step before coding it:

STEP 1 — Extend scan-ingestion for batch sessions
- ScanSession type: { sessionId, defaultCondition, startTime, itemCount }
- Session starts with operator-set default condition
- Per-item condition override supported
- Writes each processed item to intake_queue in listings.db via db-client

STEP 2 — Database schema (data/listings.db)
Tables:
  intake_queue: id, upc, extracted_title, platform, session_id, condition,
                identity_status, draft_id, publish_status, created_at
  upc_cache: upc, canonical_title, platform, genre, region, rating, resolved_at
  failed_items: id, upc, stage, reason, image_path, created_at

STEP 3 — packages/db-client/
- SQLite wrapper using better-sqlite3
- Typed functions: insertScan, updateIdentityStatus, updateDraftId,
  getUnresolved, checkDuplicate, updatePublishStatus
- This is the ONLY place in the codebase that writes to listings.db
- Export all functions from index.ts

STEP 4 — scripts/run-intake.ts
CLI: pnpm intake --condition "disc_only_acceptable" --session-name "batch-001"
- Reads from watched folder: data/intake-queue/
- Calls scan-ingestion pipeline per item
- Writes to intake_queue via db-client
- Progress output: "Processed 47/500 — 12 unresolved"

STEP 5 — scripts/run-resolve.ts
- Takes all identity_status = "unresolved" items from intake_queue
- Resolution order: upc_cache → IGDB API → eBay Browse API (title+platform)
- Writes canonical metadata to upc_cache and updates intake_queue
- Outputs: reports/unresolved_<date>.csv for manual 10-minute review pass

Follow all rules in .agents/rules/. Package boundaries are strict.
```

---

## AGENT 2 — Claude Sonnet | Planning Mode
### Label: `ebay-client`

```
Read MASTER_OUTLINE.md first.
Load the ebay-domain skill and code-standards skill.

Your task: Build packages/ebay-adapter/

This is the ONLY package that may communicate with eBay APIs.
Every other package that needs eBay data goes through this client.
No other package may import from ebay-adapter except through its index.ts exports.

Build these modules. Show me the implementation plan for each before coding:

MODULE 1 — auth.ts
- OAuth 2.0 token management
- Reads credentials from config/ebay_config.yaml only (never hardcoded)
- Auto token refresh before expiry
- Exports: getAccessToken(): Promise<string>

MODULE 2 — rate-limiter.ts
- Token bucket: 5,000 calls/day max
- Usage tracked in data/api-usage.json
- Throws typed RateLimitError with retry-after when exhausted
- Exports: withRateLimit<T>(fn: () => Promise<T>): Promise<T>

MODULE 3 — ebay-client.ts
- All fetch calls wrapped in withRateLimit()
- Exponential backoff retry: max 3 attempts
- Failed calls logged to artifacts/logs/ebay_errors_<date>.json
- Exports:
    createDraftListing(payload: DraftListingPayload): Promise<DraftResult>
    getSoldComps(title: string, platform: string): Promise<CompResult[]>
    getItemByUPC(upc: string): Promise<EbayItem | null>

MODULE 4 — payload-builder.ts
- Takes resolved GameItem + condition + price
- Assembles complete eBay Trading API payload
- VALIDATES all required fields — throws hard if anything missing
  (Title ≤80 chars, CategoryID=139973, ConditionID valid, all 4 ItemSpecifics, price ≥ floor)
- Exports: buildDraftPayload(item: GameItem): DraftListingPayload

MODULE 5 — types.ts
- DraftListingPayload (full eBay payload shape)
- DraftResult: { draftId: string, success: boolean, error?: string }
- CompResult: { price: number, soldDate: Date, condition: string }
- EbayItem, RateLimitError
Note: Types that cross into other packages go into core-domain, not here.

Follow all rules in .agents/rules/. Financial logic must be exact.
```

---

## AGENT 3 — Claude Sonnet | Planning Mode
### Label: `pricing-engine`

```
Read MASTER_OUTLINE.md first.
Load the project-state skill, ebay-domain skill, and code-standards skill.

Your task: Build packages/pricer/

This package takes a resolved item and returns a fee-aware price recommendation.
It uses ebay-adapter for comps — it does NOT call eBay directly.

Build these modules. Show me the implementation plan for each before coding:

MODULE 1 — types.ts
PricingInput: { title: string, platform: string, condition: string, cost?: number, shippingCost?: number }
CompData: { median: number, low: number, high: number, sampleSize: number, confidence: 'high' | 'medium' | 'low' }
PricingResult: { suggestedPrice: number, floorPrice: number, compData: CompData, flagged: boolean, flagReason?: string }

MODULE 2 — fee-calculator.ts
Fee rate: 13.25% (0.1325) + $0.30 fixed per transaction
Formulas:
  floor_price = (cost + shipping_out) / (1 - 0.1325)
  If no cost provided: floor = 0 (comp-only pricing)
Exports:
  calculateFloor(cost: number, shipping: number): number
  calculateFees(salePrice: number): number

TESTS REQUIRED for fee-calculator.ts:
  - Standard item: cost $2, shipping $4, expected floor ~$6.91
  - Zero cost item
  - Fee on $15 sale price
  - Price exactly at floor boundary

MODULE 3 — comp-analyzer.ts
- Takes raw CompResult[] from ebay-adapter
- Filters outliers: remove top and bottom 10% if sample > 10
- Calculates: median, low, high, sample size
- Confidence: high = 8+ comps | medium = 3–7 | low = <3 (flag for human)
- Exports: analyzeComps(comps: CompResult[]): CompData

MODULE 4 — pricer.ts
- Orchestrates: fetch comps → analyze → calculate floor → determine price
- target_price = comp_median × 0.95
- suggested_price = max(floor_price, target_price)
- Flags item if: confidence = low OR price within 10% of floor
- Flagged items written to reports/flagged_pricing_<date>.csv
- Exports: priceItem(input: PricingInput): Promise<PricingResult>

Follow all rules in .agents/rules/. Pricing math must be tested before this is done.
```

---

## AGENT 4 — Gemini Flash | Fast Mode
### Label: `config-and-maps`

```
Read MASTER_OUTLINE.md first.
Load the ebay-domain skill.

Your task: Create all configuration and mapping files for Phase 1.
These are data files and simple validators. No implementation plans needed — just build them.

FILE 1 — config/ebay_config.yaml

api:
  environment: production
  app_id: "YOUR_APP_ID_HERE"
  cert_id: "YOUR_CERT_ID_HERE"
  dev_id: "YOUR_DEV_ID_HERE"
  user_token: "YOUR_USER_TOKEN_HERE"

listing_defaults:
  category_id: "139973"
  listing_type: "FixedPriceItem"
  listing_duration: "GTC"
  country: "US"
  currency: "USD"
  dispatch_time_max: 3

shipping:
  service: "USPSMedia"
  cost: 4.99

returns:
  returns_accepted: true
  return_period: "Days_30"
  return_shipping_paid_by: "Buyer"

pricing:
  ebay_fee_rate: 0.1325
  fixed_fee: 0.30
  target_comp_multiplier: 0.95
  min_comp_count: 3

rate_limits:
  calls_per_day: 5000
  retry_max_attempts: 3
  retry_base_delay_ms: 1000

FILE 2 — data/condition_map.json
Map our 3 exact condition labels to eBay fields:

{
  "disc_only_acceptable": {
    "ebayConditionId": "3000",
    "ebayConditionLabel": "Used",
    "listingDescription": "Disc only. Disc may have light to moderate scratches but plays without issue. No case or insert included.",
    "titleSignal": "Disc Only"
  },
  "used_very_good": {
    "ebayConditionId": "3000",
    "ebayConditionLabel": "Used",
    "listingDescription": "Disc in very good condition with minimal scratches. Case and insert included unless otherwise noted.",
    "titleSignal": "Very Good"
  },
  "new": {
    "ebayConditionId": "1000",
    "ebayConditionLabel": "New",
    "listingDescription": "Brand new factory sealed. Never opened.",
    "titleSignal": "New Sealed"
  }
}

FILE 3 — data/item_specifics_map.json
Platform name variations → canonical eBay platform names.
Include at minimum: ps4, ps5, switch, nintendo switch, xbox one, xbox series x,
xbox series s, xbox 360, ps3, wii u, wii, 3ds, ds, and common misspellings.
Add default_region: "NTSC", required_specifics array, default_genre, default_rating.

FILE 4 — packages/config-loader/index.ts
- Reads ebay_config.yaml using js-yaml
- Reads condition_map.json and item_specifics_map.json
- Typed exports: getEbayConfig(), getConditionMap(), getItemSpecifics()
- Validates required fields on load — throws if API keys are still placeholder values
- Exports: normalizePlatform(input: string): string
- Exports: getConditionPayload(conditionKey: string): ConditionPayload

FILE 5 — packages/config-loader/__tests__/config-loader.test.ts
- Test normalizePlatform with common variations (ps4, PS4, playstation 4)
- Test getConditionPayload for all 3 condition types
- Test that validator throws on placeholder API keys

Follow all rules in .agents/rules/.
```

---

## AGENT 5 — Gemini Flash | Fast Mode
### Label: `listing-agent`

```
Read MASTER_OUTLINE.md first.
Load the project-state skill and ebay-domain skill.

Your task: Build packages/listing-agent/

This module calls the Anthropic API to generate eBay listing copy.
It uses Claude (claude-sonnet-4-20250514), NOT Gemini.
Reads ANTHROPIC_API_KEY from environment.

FILE 1 — types.ts
GameItem: {
  title: string
  platform: string
  condition: string            // "disc_only_acceptable" | "used_very_good" | "new"
  conditionDescription: string
  genre?: string
  region: string
  rating?: string
  compData: CompData
  suggestedPrice: number
}
ListingCopy: {
  title: string        // max 80 chars
  description: string  // max 400 chars
  itemSpecifics: Record<string, string>
}

FILE 2 — prompt-templates.ts
Build the Claude prompt that generates listing copy.

Title rules (hard):
- Pattern: "[Platform abbreviated] [Game Title] [Edition if notable] - [Condition Signal]"
- Max 80 characters always
- Platform abbreviated: PS4, PS5, Switch, Xbox One — not full name
- Condition signal at end always
- Zero filler words: no "Great!", "Fast shipping!", "Look!", "Wow"
- Examples:
    "PS4 God of War - Disc Only"
    "Nintendo Switch Zelda Breath of the Wild - Very Good"
    "PS5 Demon's Souls - New Sealed"

Description rules (hard):
- Factual only. No hype. No fake urgency.
- State what is and is not included.
- Max 400 characters.
- Examples:
    disc_only_acceptable: "PS4 game disc only. Disc plays without issue. Has moderate scratches. No case or insert included. Tested and working."
    used_very_good: "PS4 game in very good condition. Minimal scratches. Case and insert included. Tested and working."
    new: "PS4 game. Brand new factory sealed. Never opened."

FILE 3 — listing-agent.ts
Show me the implementation plan before coding this file.

- Calls Anthropic API with prompt template
- Parses JSON response: { title, description, itemSpecifics }
- Validates: title ≤ 80 chars, description ≤ 400 chars, all item specifics present
- Retry once with stricter prompt if validation fails
- If second attempt fails: flag item for manual review, log to failed queue
- Logs all calls: artifacts/logs/listing_agent_<date>.json
  Structure: { timestamp, input_snapshot, output, tokens_used, flagged }
- Exports: generateListingCopy(item: GameItem): Promise<ListingCopy>

FILE 4 — scripts/run-listing-agent.ts
CLI: pnpm list-item --id 123
- Takes single item ID from intake_queue
- Runs through listing-agent
- Prints output for review before any draft is created

FILE 5 — __tests__/listing-agent.test.ts
Write 6 test cases with real game examples:
- PS4 God of War (disc_only_acceptable)
- Switch Zelda BOTW (used_very_good)
- PS5 Spider-Man (new)
- Xbox One Halo 5 (disc_only_acceptable)
- PS3 The Last of Us (used_very_good)
- Any game with a long title that risks exceeding 80 chars
Verify per test: title length ≤ 80, no filler words, condition signal present,
disc only called out when applicable.

Follow all rules in .agents/rules/.
```

---

# PART 7 — SESSION MANAGEMENT

## Starting Every Session
1. Run `/morning-check` before launching any agents
2. Review what it tells you — don't skip this
3. Launch agents in order: 4 → 5 → 2 → 3 → 1 (Flash first, Pro last)
4. Stagger by 5 minutes — don't approve all 5 implementation plans at once

## During a Session
- Flash agents finish in 10–20 min, Sonnet in 20–40 min, Pro in 40–90 min
- When Flash agents finish: review output before spinning up new tasks
- Never let two agents touch the same file
- If an agent's plan touches a file another agent owns: stop it, redirect

## Ending Every Session
1. Run `/review-diff` on any open changes
2. Run `/update-project-state`
3. Only merge after both pass clean

## When You Hit an Allotment Limit
- Gemini Pro exhausted → switch task to Sonnet, drop to Fast mode
- Sonnet exhausted → switch to Flash for non-financial tasks only
- Flash exhausted → unlikely; if so, wait for refresh or use Sonnet carefully
- Never switch models mid-task on the same file — finish or restart clean

---

# PART 8 — QUICK REFERENCE

## Keyboard Shortcuts
| Action | Shortcut |
|---|---|
| Toggle Editor / Agent Manager | Cmd + E |
| Toggle agent side panel | Cmd + L |
| Inline command in editor/terminal | Cmd + I |
| Toggle terminal | Ctrl + ` |
| Undo agent changes | Click ↩️ in agent chat |

## Model Selection
Click model dropdown in the conversation input area before sending first message.

## Planning vs Fast Toggle
Click the mode pill next to model selector.

## Artifact Review
Top right of Agent Manager → click artifact count to see all implementation plans.
Comment on plans directly to redirect before any code is written.

## Allotment Check
Settings → Usage → shows remaining per model pool.
Check this at the start of each session before choosing which agents to run.
