---
trigger: always_on
---

phase-review

Purpose
- Audit one implemented seam without widening scope.

Required flow
1. Confirm current branch, sync state, and working tree.
2. Read the latest relevant phase report and latest relevant commit(s).
3. Inspect only the routed seam and named files.
4. Check:
   - implementation matches routed goal
   - file changes are bounded
   - validations are real and sufficient
   - commit/push hygiene was followed
   - the seam did not reopen a closed ladder
5. Return one verdict only:
   - correct
   - correct with minor notes
   - incomplete
   - incorrect
6. If not correct, route the next smallest corrective seam only.

Return
- verdict
- evidence
- exact issue list
- next bounded fix if needed

Stop conditions
- Review requires redesign outside the seam.
- Evidence is insufficient for a truthful verdict.