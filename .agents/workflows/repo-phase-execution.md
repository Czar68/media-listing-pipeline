---
description: Run one bounded repo phase from start to finish.
---

repo-phase-execution

Run one bounded repo phase from start to finish.

Sequence:
1. Restate the seam in one sentence.
2. List exact file scope before changing anything.
3. Make the minimum required change only.
4. Stop immediately on blocker or scope expansion.
5. Run the minimum real validation commands required by the seam.
6. If the seam touches repo-root deterministic execution verification, also run:
   - npm run verify:media-listing:deterministic-execution-audit
7. If execution is blocked, return not proven and stop.
8. Review changed files against scope.
9. Finalize only if evidence is real, scope is clean, reporting is truthful, and git hygiene is complete.
10. Update PROJECT_STATE.md append-only if the phase changes repo workflow state, invariants, or deterministic execution verification structure.

Return:
- Assumptions
- Exact file scope
- Exact commands run
- Real command output
- Files changed
- Validation result
- Acceptance recommendation
- Blockers