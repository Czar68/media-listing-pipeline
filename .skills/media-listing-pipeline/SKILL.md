# SKILL: media-listing-pipeline

## Repo summary
- Repo: media-listing-pipeline
- Classification: Type A — deterministic engineering
- Purpose: deterministic media-listing pipeline with strong repo-root verification and auditability requirements, especially around deterministic execution artifacts, contracts, packages, and verifier behavior.

## Repo invariants
- Repo-root deterministic execution work must stay bounded to the routed seam.
- Closed deterministic execution ladders stay closed unless a concrete missing gap is proven.
- New repo-root deterministic execution seams should improve verification clarity, auditability, or deterministic artifact coverage.
- Do not reopen completed ladders with repetitive aggregate wiring.
- Do not broaden into package internals unless strictly necessary.
- Naming cleanup is closed unless a concrete inconsistency is proven.
- Validation claims must always be backed by real command output.

## Acceptance specifics
- A bounded phase is not complete until:
  - seam-local validation passed with real output
  - required repo-root audit checks passed when applicable
  - scoped diff was reviewed
  - only intended files were staged
  - the commit exists and is pushed
  - final git status -sb is clean
- For repo-root deterministic execution verification seams, acceptance requires:
  - the new seam-local verifier passes
  - npm run verify:media-listing:deterministic-execution-audit passes
  - any impacted verifier-governance checks still pass after the new command or file is introduced

## Validation specifics
- Required seam-local commands:
  - run the exact verifier or check introduced or changed by the seam
- Required broader checks for repo-root deterministic execution verification seams:
  - npm run verify:media-listing:deterministic-execution-audit
- When a seam introduces a new repo-root deterministic execution verifier command, re-run any affected repo-root governance checks already present in the verification stack.
- Never claim validation without output.

## Special do-not-break rules
- Do not change aggregate verifier membership unless the routed seam explicitly targets aggregate composition.
- Do not add new verifier commands without minimally updating any existing repo-root governance checks that depend on command discovery.
- Do not create broad refactors while implementing a bounded verification seam.
- Do not fabricate validation, status, commit, or push state.
- If checked-in artifacts under artifacts/ are required and artifacts/ is gitignored, force-add only the exact intended tracked file.

## Project-state rules
- Project-state file: PROJECT_STATE.md
- Update rule: append-only
- Update when:
  - a bounded phase completes
  - deterministic execution verification structure changes
  - repo workflow or audit structure changes
  - repo invariants or acceptance rules change

## Git discipline
- Commit frequency: after every bounded phase
- Push rule: push immediately after each scoped commit
- Untracked-source rule: resolve unexpected untracked source files or source directories before closing the phase
- Ahead-of-origin rule: if the branch is ahead of origin, push before starting new work

## Routing notes
- ChatGPT is the senior engineer, phase router, analysis owner, and prompt writer.
- Executor performs bounded implementation and seam-local verification only.
- Prefer single bounded seams with exact file scope, proof requirements, and stop conditions.