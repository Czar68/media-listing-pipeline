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
