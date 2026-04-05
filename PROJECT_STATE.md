# PROJECT STATE

Status: PHASE_4_COMPLETE

Current Phase:
PHASE_04_IDENTITY_APPLICATION

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
