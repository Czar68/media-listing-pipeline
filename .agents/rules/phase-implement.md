---
trigger: always_on
---

phase-implement

Purpose
- Execute one bounded seam with real validation and strict git hygiene.

Required flow
1. Confirm repo state:
   - git status -sb
   - git fetch origin
   - git status -sb
   - git log -1 --oneline
2. Restate:
   - exact phase goal
   - exact file scope
   - explicit stop conditions
3. Implement only the minimum change required for the routed seam.
4. Run seam-local validation.
5. If the seam touches repo-root deterministic execution verification, also run:
   - npm run verify:media-listing:deterministic-execution-audit
6. Inspect scoped diff only.
7. Stage only intended files.
8. Verify staged diff.
9. Commit immediately.
10. Push immediately.
11. Update PROJECT_STATE.md append-only if repo state, workflow state, invariants, or deterministic execution verification structure changed.
12. Return:
   - assumptions
   - files changed
   - what changed
   - validation run results
   - final git status -sb
   - final git log -1 --oneline

Stop conditions
- Scope expands beyond routed seam.
- Required validation fails for reasons outside seam scope.
- Package internals are required but were not in scope.
- Unexpected unrelated file changes appear.
- A blocker prevents truthful completion.