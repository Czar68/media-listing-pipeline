---
trigger: always_on
---

Workspace Rule — media-listing-pipeline

Repo
- Name: media-listing-pipeline
- Classification: Type A — deterministic engineering

Purpose
- Maintain strict bounded-phase execution for deterministic media-listing pipeline work, with strong repo-root verification, real validation evidence, clean git hygiene, and project-state tracking.

Rules
- Work only on the routed seam.
- Prefer one bounded phase at a time.
- Do not widen scope unless a concrete blocker is proven.
- Closed ladders stay closed unless a real missing gap is proven.
- For deterministic execution work, stay in the deterministic execution stack and repo-root verification layer unless the routed phase explicitly says otherwise.
- Do not broaden into package internals unless strictly necessary for the bounded seam.
- Naming cleanup is closed unless a concrete inconsistency is proven.
- Do not rename commands, files, or layers without explicit evidence.
- Before editing, confirm branch, sync with origin, and clean working tree.
- Inspect scoped diff only.
- Stage only intended files.
- Verify staged diff before commit.
- Commit immediately after each completed bounded phase.
- Push immediately after each scoped commit.
- If branch is ahead of origin, stop and push before starting the next phase.
- PROJECT_STATE.md is the repo state file at repo root.
- Update PROJECT_STATE.md append-only after completed bounded phases and after workflow, invariant, or deterministic execution verification structure changes.
- No simulated validation.
- Do not claim command execution, git state, or validation success without real output.
- Run seam-local validation plus required repo-root checks.
- For repo-root deterministic execution verification seams, run the seam-local verifier and npm run verify:media-listing:deterministic-execution-audit.
- Treat checked-in deterministic artifacts and contracts as part of the repo-root audit surface.
- If a tracked artifact under artifacts/ must be committed while artifacts/ is gitignored, use the established force-add pattern only for the exact intended tracked file.
- Stop and report blockers clearly.
- Prefer incomplete over incorrect.
- ChatGPT is the senior engineer, phase router, analysis owner, and prompt writer.
- Executor performs bounded implementation and seam-local verification only and must not broaden scope or choose the next phase.