# PROJECT STATE

Status: PHASE_1_COMPLETE

Current Phase:
PHASE_01_DOMAIN_AND_CONDITION_ENGINE_FOUNDATION

Approved Next Phase:
TBD (not yet selected in this repo)

Core Invariants:
- No ListingDraft without ConditionSignatureEvent
- No condition defaults or inference
- No marketplace logic in core
- Multi-disc requires per-disc grading
- Identity conflicts route upstream
- Burned discs block

Legacy:
All legacy repos are archived and read-only

---

## Phase 1 — DOMAIN_AND_CONDITION_ENGINE_FOUNDATION (2026-04-03)

**Packages created:** `packages/core-domain`, `packages/core-condition`

**Core rules established:**
- `core-domain` has no external package imports; `core-condition` imports only `core-domain` plus Node `crypto` for deterministic hashing.
- Versioned grading standards, severity criteria, completeness templates, and defect taxonomy live in `core-condition` standards.
- Rules cover authenticity (burned disc block), overall vs worst component grade, resurfaced ceiling, grade–defect and completeness–grade semantics, structured validation failures, and completeness hashing before any `ConditionSignatureEvent`.

**Proof completed:** Oracle suite in `packages/core-condition/tests/oracle/oracle.test.ts` (13 scenarios) — all passing via `npm test` at repo root.

**Deferred:** Adapters, UI, publish, AI, pricing, and marketplace-specific fields (explicitly out of scope for Phase 1).
