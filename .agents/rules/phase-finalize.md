---
trigger: always_on
---

phase-finalize

Purpose
- Close one bounded seam cleanly and verify repo hygiene.

Required checks
- Validation passed with real output.
- Only intended files changed.
- Commit exists.
- Commit is pushed.
- git status -sb is clean.
- Branch is not ahead of origin.
- PROJECT_STATE.md was updated if required.
- No unexpected untracked source files or source directories remain.

Required commands
- git status -sb
- git log -1 --oneline

Return
- seam closed: yes/no
- validation summary
- git hygiene summary
- project-state update summary
- remaining blocker, if any
