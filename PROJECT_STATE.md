# PROJECT STATE

Status: PHASE_11_IN_PROGRESS

Current Phase:
PHASE_11_BULK_STRESS_TESTING

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

---

## Phase 2 — CORE_IDENTITY_FOUNDATION (2026-04-03)

**Phase 2 complete.** `packages/core-identity` added.

**Packages:** `packages/core-domain`, `packages/core-condition`, `packages/core-identity`

**Identity rules established:**
- `core-identity` imports only `@media-listing/core-domain` (validation helpers); no `core-condition`, no eBay fields, no I/O, no inference from condition.
- Explicit `IdentityCandidate` / `IdentityCandidateSet`, `ResolvedIdentity` (manual-only decision source), immutable `IdentitySnapshot` with deterministic `snapshotId`, strict `IdentityConflict` kinds (`MISMATCHED_DISC`, `REGION_CONFLICT`, `MULTI_MATCH_AMBIGUITY`, `INSUFFICIENT_DATA`), and `IdentityResolutionResult` union (`RESOLVED` | `CONFLICT` | `RESEARCH_REQUIRED`).
- Confidence is advisory only; resolution never auto-selects; multiple candidates require an explicit selection; alignment checks use explicit `IdentityAlignmentProbe` data only.
- Identity conflict model established; snapshot identity change yields a new `snapshotId` (prior snapshot invalidated for downstream use); no-inference rule confirmed.

**Proof completed:** Oracle suite in `packages/core-identity/tests/oracle/oracle.test.ts` (10 scenarios) — all passing via `npm test` at repo root.

**Deferred:** Adapters, UI, publish, AI, pricing, eBay integration (out of scope for Phase 2).

---

## Phase 3 — SCAN_INGESTION (2026-04-03)

- Phase 3 complete
- `packages/scan-ingestion` added
- Disc-only logic absorbed into the ingestion layer (rebuilt; legacy code not copied)
- Deterministic candidate generation established
- No-inference rule enforced at ingestion (observations stay null unless present on the scan)

**Phase 3 complete.** `packages/scan-ingestion` added.

**Packages:** `packages/core-domain`, `packages/core-identity`, `packages/scan-ingestion` (imports `core-domain` + `core-identity` only; no `core-condition`).

**Ingestion rules established:**
- Raw `ScanRecord` → `NormalizedScan` (trimmed strings, digit-only UPC with length check, no invented observations).
- `generateCandidatesFromScan` → `CandidateGenerationResult` union (`SUCCESS` | `PARTIAL` | `FAILURE`) producing `IdentityCandidateSet` from `core-identity` only — no identity resolution, no condition, no I/O, no eBay fields, no AI.
- Deterministic candidate generation order: UPC (`HIGH`) → CATALOG title (`MEDIUM`, exact `||` structured split) → MANUAL (`LOW` when `scanSource === MANUAL`).
- Invalid UPC format yields warnings and does not block title-based candidates; missing title and UPC yields `FAILURE`.
- Disc-only and related legacy behavior is absorbed as structured scan input and deterministic candidate emission only — legacy code not copied.

**Proof completed:** Oracle suite in `packages/scan-ingestion/tests/oracle/oracle.test.ts` (10 scenarios) — all passing via `npm test` at repo root.

**Deferred:** Identity resolution, condition, pricing, marketplace adapters (out of scope for Phase 3).

---

## Phase 4 — IDENTITY_APPLICATION (2026-04-03)

- Phase 4 complete
- `packages/identity-application` added
- Operator identity resolution boundary established
- Audit record model added (`ResolutionAuditRecord`)
- No auto-selection rule preserved at the application boundary

**Packages:** `packages/identity-application` imports only `@media-listing/core-domain` and `@media-listing/core-identity` (no `core-condition`, no scan-ingestion internals).

**Application rules established:**
- `IdentityResolutionRequest` carries explicit `selectedCandidateId | null`, `rationale | null`, and `alignmentProbe | null` — mapped into `resolveIdentity` without substituting selection or fabricating alignment when null (`alignment` omitted; core yields `INSUFFICIENT_DATA` / `ALIGNMENT_REQUIRED` when a selection exists but no probe).
- `IdentityResolutionApplicationResult` mirrors core outcomes (`RESOLVED` | `CONFLICT` | `RESEARCH_REQUIRED`) with `resolvedIdentity` + `identitySnapshot` only on success; conflicts pass through unchanged; `RESEARCH_REQUIRED` carries the core payload.
- `buildResolutionAuditRecord` produces data-only audit rows (no persistence).
- Minimal `core-identity` extension: optional `alignment` on `ResolveIdentityInput` and `ALIGNMENT_REQUIRED` insufficient-data reason for explicit alignment gaps without dummy probes.

**Proof completed:** Oracle suite in `packages/identity-application/tests/oracle/oracle.test.ts` (10 scenarios) — all passing via `npm test` at repo root.

**Deferred:** Condition pipeline, adapters, UI, APIs (out of scope for Phase 4).

---

PHASE_04 — identity-application

* status: complete
* package: packages/identity-application
* summary:

  * operator identity resolution boundary established
  * deterministic bridge to core-identity
  * audit record model added
  * no auto-selection rule enforced

---

## Deterministic execution export / verify chain (maintenance map)

**Fixture source:** `buildExecutionFixture()` from `@media-listing/media-listing-execution-fixture` is the only source of deterministic execution input for repo-root export scripts. Do not duplicate that shape inline.

**Repo-root npm scripts (deterministic):**

| Script | Role |
|--------|------|
| `export:media-listing:pipeline` | Pipeline JSON snapshot export |
| `verify:media-listing:execution-fixture-package` | Build pipeline + fixture packages only |
| `verify:media-listing:execution-plan` | Plan artifact verify |
| `verify:media-listing:execution-run` | Run artifact verify |
| `verify:media-listing:execution-report` | Report artifact verify |
| `verify:media-listing:execution-bundle` | Bundle JSON export verify |
| `verify:media-listing:execution-bundle-package` | Build planner → runner → report → bundle packages only (no fixture script) |
| `verify:media-listing:execution-full-snapshot` | Execution full snapshot JSON verify |
| `verify:media-listing:execution-full-snapshot-loader` | Execution full snapshot loader (minimal top-level section check) |
| `export:media-listing:execution-full-snapshot-contract` | Deterministic execution full snapshot contract JSON export |
| `verify:media-listing:execution-full-snapshot-contract` | Contract verify for full snapshot (runs contract export first) |
| `export:media-listing:execution-full-snapshot-package` | Package JSON bundling snapshot + contract artifacts |
| `verify:media-listing:execution-full-snapshot-package` | Full snapshot package verify (regenerates snapshot, contract, package, then verifies) |
| `verify:media-listing:deterministic-execution-stack` | Aggregate verifier: runs the deterministic execution verification ladder in order, ending at full snapshot |
| `export:media-listing:deterministic-execution-stack-package` | Writes stack contract package JSON (stable artifact path references) |
| `verify:media-listing:deterministic-execution-stack-package-loader` | Deterministic execution stack package loader (shape of checked-in stack package artifact) |
| `export:media-listing:deterministic-execution-stack-package-contract` | Writes checked-in contract JSON derived from the stack package artifact |
| `verify:media-listing:deterministic-execution-stack-package-contract` | Compares stack package artifact to checked-in contract |
| `export:media-listing:deterministic-execution-stack-package-package` | Writes checked-in package JSON derived from the stack package contract artifact |
| `verify:media-listing:deterministic-execution-stack-package-package` | Compares stack package contract to checked-in package artifact |
| `verify:media-listing:deterministic-execution-surface` | Aggregate verifier: deterministic execution stack plus stack-package export/verify ladder |
| `export:media-listing:deterministic-execution-surface-package` | Writes checked-in surface package JSON (paths to final verification artifacts) |
| `verify:media-listing:deterministic-execution-surface-package-loader` | Deterministic execution surface package loader (shape of checked-in surface package artifact) |

**Typical build order (high level):** `media-listing-pipeline` → `media-listing-execution-fixture` (when a script uses the fixture) → `media-listing-execution-planner` → `media-listing-execution-runner` → `media-listing-execution-report` → `media-listing-execution-bundle` → then the `node scripts/...` step where applicable.

**Order gotchas:**

- **Planner depends on pipeline** — always build `media-listing-pipeline` before planner (and thus before any chain that compiles or runs code that imports planner).
- **Bundle depends on report** — `media-listing-execution-bundle` imports `media-listing-execution-report`; build report before bundle.

**Do not rely on stale workspace `dist/` output** — npm script chains in `package.json` are the source of truth for which packages get built before each verify/export; a clean clone should succeed without depending on leftover builds.

---

## PHASE_52 — Deterministic execution full snapshot loader (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:execution-full-snapshot-loader` runs `scripts/load-execution-full-snapshot.js`, which resolves `artifacts/media-listing-execution-full-snapshot.json` relative to the script (not `process.cwd()`) and verifies minimal top-level aggregate sections: `fixture`, `pipeline`, `plan`, `run`, `report`, `bundle`. Use after `verify:media-listing:execution-full-snapshot` (or equivalent export) so the artifact exists.

---

## PHASE_53 — Deterministic execution full snapshot contract verification (2026-04-05)

**Append-only note:** Checked-in `artifacts/media-listing-execution-full-snapshot-contract.json` describes the required top-level sections for `media-listing-execution-full-snapshot.json`. `export:media-listing:execution-full-snapshot-contract` writes that contract; `verify:media-listing:execution-full-snapshot-contract` re-exports the contract then runs `scripts/verify-execution-full-snapshot-contract.js`, which resolves both paths relative to the script and fails if the snapshot is missing any contract-required keys. Run after the full snapshot exists (for example via `verify:media-listing:execution-full-snapshot`).

---

## PHASE_54 — Deterministic execution full snapshot package verification (2026-04-05)

**Append-only note:** `artifacts/media-listing-execution-full-snapshot-package.json` bundles parsed `snapshotArtifact` and `contractArtifact` from the standalone snapshot and contract files. `export:media-listing:execution-full-snapshot-package` reads those artifacts (paths relative to the script) and writes the package. `verify:media-listing:execution-full-snapshot-package` runs full snapshot verify, contract export, package export, then `scripts/verify-execution-full-snapshot-package.js`, which validates shape and that every `contractArtifact.requiredTopLevelSections` entry exists on `snapshotArtifact`.

---

## PHASE_55 — Aggregate deterministic execution stack verifier (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:deterministic-execution-stack` composes the existing deterministic execution verification ladder in dependency order (fixture package → plan → run → report → bundle → bundle package → full snapshot) and fails on the first failing step. It does not add new coverage beyond chaining those commands.

---

## PHASE_56 — Deterministic execution stack contract package (2026-04-05)

**Append-only note:** `export:media-listing:deterministic-execution-stack-package` writes checked-in `artifacts/media-listing-deterministic-execution-stack-package.json`, a minimal contract map of stable `artifacts/…` references for the aggregate stack (plan/run/report/bundle JSON outputs, full snapshot contract and package; build-only steps use `relativePath: null`). Run `verify:media-listing:deterministic-execution-stack` first (and contract/package exports as needed) so the referenced files exist.

---

## PHASE_57 — Deterministic execution stack package loader verification (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:deterministic-execution-stack-package-loader` runs `scripts/verify-deterministic-execution-stack-package-loader.js`, which resolves `artifacts/media-listing-deterministic-execution-stack-package.json` relative to the script (not `process.cwd()`) and verifies the fixed top-level keys and `relativePath` entries for the stack package contract. Use after `export:media-listing:deterministic-execution-stack-package` (with prerequisites satisfied) so the artifact matches the exporter output.

---

## PHASE_58 — Deterministic execution stack package contract verification (2026-04-05)

**Append-only note:** Checked-in `artifacts/media-listing-deterministic-execution-stack-package-contract.json` records the expected stack package shape (same eight keys and `relativePath` values as the loader). `export:media-listing:deterministic-execution-stack-package-contract` derives it only from `artifacts/media-listing-deterministic-execution-stack-package.json`. `verify:media-listing:deterministic-execution-stack-package-contract` compares the package artifact to that contract. Run stack package export first, then contract export, then contract verify when updating either artifact.

---

## PHASE_59 — Deterministic execution stack package package verification (2026-04-05)

**Append-only note:** Checked-in `artifacts/media-listing-deterministic-execution-stack-package-package.json` is the packaged verification surface for the stack contract: same eight keys and `relativePath` map as the contract. `export:media-listing:deterministic-execution-stack-package-package` reads only `artifacts/media-listing-deterministic-execution-stack-package-contract.json` and writes the package artifact. `verify:media-listing:deterministic-execution-stack-package-package` compares contract to package. This completes the loader → contract → package ladder for the aggregate stack package.

---

## PHASE_60 — Full deterministic execution surface verifier (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:deterministic-execution-surface` runs `verify:media-listing:deterministic-execution-stack` first, then the aggregate stack-package ladder in order: stack package export, stack package loader, stack package contract export, stack package contract verify, stack package package export, stack package package verify. It is the single gate for the deterministic execution surface composed of the stack verifier plus the stack-package verifier ladder.

---

## PHASE_61 — Deterministic execution surface package export (2026-04-05)

**Append-only note:** `export:media-listing:deterministic-execution-surface-package` writes checked-in `artifacts/media-listing-deterministic-execution-surface-package.json`, a minimal map of `relativePath` entries to the four final verification artifacts (full snapshot contract/package, stack package contract/package). It reads each file only to require existence and valid JSON; the surface package stores paths only. Ensure those artifacts exist (for example via the surface verifier or prior exports) before exporting.

---

## PHASE_62 — Deterministic execution surface package loader verification (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:deterministic-execution-surface-package-loader` runs `scripts/verify-deterministic-execution-surface-package-loader.js`, which resolves `artifacts/media-listing-deterministic-execution-surface-package.json` relative to the script (not `process.cwd()`) and verifies the four top-level keys and `relativePath` strings. Use after `export:media-listing:deterministic-execution-surface-package` so the artifact exists.

---

## PHASE_63 — Deterministic execution surface package contract verification (2026-04-05)

**Append-only note:** Checked-in `artifacts/media-listing-deterministic-execution-surface-package-contract.json` records the expected surface package shape (same four keys and `relativePath` values as the loader). `export:media-listing:deterministic-execution-surface-package-contract` derives it only from `artifacts/media-listing-deterministic-execution-surface-package.json`. `verify:media-listing:deterministic-execution-surface-package-contract` compares the surface package artifact to that contract. Run surface package export first, then contract export, then contract verify when updating either artifact.

---

## PHASE_64 — Deterministic execution surface package package verification (2026-04-05)

**Append-only note:** Checked-in `artifacts/media-listing-deterministic-execution-surface-package-package.json` is the packaged verification surface for the surface contract: same four keys and `relativePath` map as the contract. `export:media-listing:deterministic-execution-surface-package-package` reads only `artifacts/media-listing-deterministic-execution-surface-package-contract.json` and writes the package artifact. `verify:media-listing:deterministic-execution-surface-package-package` compares contract to package. This completes the loader → contract → package ladder for the deterministic execution surface package.

---

## PHASE_65 — Deterministic execution surface package aggregate verifier (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:deterministic-execution-surface-package` runs the full deterministic execution surface package ladder in order: surface package export, surface package loader, surface package contract export, surface package contract verify, surface package package export, surface package package verify. It is the single gate for that ladder and fails on the first failing step.

---

## PHASE_66 — Top-level deterministic execution verification gate (2026-04-05)

**Append-only note:** Repo-root `verify:media-listing:deterministic-execution` composes the full deterministic execution verification surface: `verify:media-listing:deterministic-execution-surface` first, then `verify:media-listing:deterministic-execution-surface-package`. It is the single repo-root gate for deterministic execution verification and fails on the first failing step.

---

## PHASE_67 - Repo workflow/bootstrap adoption (2026-04-10)

**Append-only note:** Added repo-local workflow/bootstrap assets for the standardized AI execution model: .agents/rules/media-listing-pipeline.md, .agents/rules/phase-implement.md, .agents/rules/phase-review.md, .agents/rules/phase-finalize.md, .agents/rules/phase-acceptance.md, .agents/workflows/repo-phase-execution.md, .skills/media-listing-pipeline/SKILL.md, and AI_WORKFLOW_BOOTSTRAP.md. These establish the repo-local workspace rule, the four standard bounded-phase workflows, the repo skill file, and the bootstrap summary. PROJECT_STATE.md remains append-only and is updated because repo workflow state changed.

---

## EBAY SCANNER V1 — PHASE 1 (2026-04-17)

**Append-only note:** Added `scripts/ebay-scanner-v1.js` as single-item deterministic listing compiler (Production Core). Operational baseline established.
## AI_BROKER_AND_INFRASTRUCTURE_ADOPTION (2026-05-02)

**Append-only note:** Established the foundational AI broker worker and unified infrastructure. Created `core/ai_broker/identity_worker.py` with RabbitMQ integration and Pydantic-based manifest processing. Standardized `infrastructure/docker/docker-compose.yml` with RabbitMQ, Postgres, and Redis services including healthchecks and network isolation. Ensured python package integrity by creating `__init__.py` files across `adapters`, `api`, `auth`, `data`, and `core/financials`.

---

## PHASE_06_FINANCIAL_LOGIC (2026-05-02)

**Append-only note:** Phase started. Implemented deterministic financial calculation module `core/financials/calculator.py` with formulas for eBay fees, standard shipping, and net profit. Created `core/ai_broker/financial_worker.py` to listen on the `financial_pipeline` RabbitMQ queue, enrich manifests with calculated financials, and route items to `ready_for_listing` or `flagged_for_review` based on a $2.00 profit threshold.

**Append-only note:** Phase 6 verification complete. Authored `tests/test_financials.py` and converted calculator logic to use the `decimal` module to eliminate floating-point imprecision. Tests passing for standard profit calculation and loss-leader worker flagging. Additionally, configured database seeding with `infrastructure/docker/seeds/init_pricing.sql` and mounted to the Postgres container via `docker-compose.yml`.

---

## PHASE_07_FORENSIC_OCR (2026-05-02)

**Append-only note:** Phase started. Implemented the Forensic OCR Layer. Created `core/ai_broker/ocr_engine.py` with the `DiscScanner` class configured for Vertex AI/Gemini extraction of Matrix/Hub Codes and Copyright Text. Updated `core/ai_broker/identity_worker.py` to route manifests pending forensic OCR to the scanner and log extracted codes. Instantiated the UPC bridge with a mocked `lookup_by_hub_code` function in `core/adapters/upc_oracle.py` to prepare for legacy scanner integration.

---

## PHASE_08_PIPELINE_INTEGRATION (2026-05-02)

**Append-only note:** Phase started. Wired the Forensic OCR extraction to the UPC Oracle. Created local mapping database `data/hub_mappings.json` for deterministic checks. Refactored `lookup_by_hub_code` to simulate database lookup. Updated `identity_worker` to parse hub matches, hydrate UPC/Title attributes in the manifest, and successfully advance the pipeline status to `pending_financial_evaluation`. Created `scripts/test_pipeline_run.py` and executed the integration test over RabbitMQ.

---

## PHASE_09_FULL_PIPELINE_VALIDATION (2026-05-02)

**Append-only note:** Phase complete. Completed the Financial Evaluation Loop by executing `identity_worker` and `financial_worker` concurrently via RabbitMQ. Updated `test_pipeline_run.py` to inject a $10.00 DVD mock manifest, wait on the `final_results` queue, and assert the output logic. Verified exact calculated profit ($2.95) and strict assertion that `human_review_required` is `False`. Cleaned up queues. The media listing pipeline is operational from OCR injection to final financial routing.

---

## PHASE_10_LISTING_ENGINE_DRAFTING (2026-05-02)

**Append-only note:** Phase started. Implemented the eBay Listing Drafting Engine. Created `core/listing_engine/templates.py` with standard constraints ("Authentic", "Loose Disc", "Untested/Scratched Surface") for Disc Only media. Created `core/listing_engine/seo_optimiser.py` to compile highly optimized 80-character titles. Created `core/ai_broker/listing_worker.py` to consume from `listing_pipeline`, hydrate manifestations with `ebay_category_id: 617`, and emit a `draft_listing.json` payload locally. Updated `financial_worker.py` to advance pipeline to `listing_pipeline`.

---

## PHASE_11_BULK_STRESS_TESTING (2026-05-02)

**Append-only note:** Phase started. Implemented Bulk Pipeline Injection and Draft Validation. Added `scripts/bulk_test_injection.py` to blast 5 unique manifests concurrently with valid and invalid Hub Codes to test the `human_review` gate. Added `scripts/check_drafts.py` to parse `data/drafts/` and print a summary verification table. Validated concurrency logic for no file-write collisions by scaling the drafts out by UUID-based filenames.
