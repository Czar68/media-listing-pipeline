---
trigger: always_on
---

phase-acceptance

Purpose
- Prove the bounded seam is acceptable against media-listing-pipeline invariants.

Acceptance rules
- No simulated validation.
- No claimed success without command output.
- Seam-local validation must pass.
- For repo-root deterministic execution verification seams:
  - the new seam-local verifier must pass
  - npm run verify:media-listing:deterministic-execution-audit must pass
- If the seam adds a new repo-root deterministic execution verifier command, all impacted repo-root governance checks must still pass after the change.
- Working tree must end clean.
- Latest scoped commit must be pushed.

Return
- acceptance target
- commands run
- pass/fail
- evidence
- next corrective seam if fail
