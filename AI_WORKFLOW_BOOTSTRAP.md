media-listing-pipeline bootstrap

- Classification: Type A — deterministic engineering
- Install one workspace rule only for this repo
- Install exactly four workflows:
  - phase-implement
  - phase-review
  - phase-finalize
  - phase-acceptance
- Keep repo-specific invariants, acceptance specifics, validation specifics, and do-not-break rules in:
  - .skills/media-listing-pipeline/SKILL.md
- PROJECT_STATE.md is the repo state file at repo root
- Use append-only project-state updates
- Do not add extra workflows unless a concrete repo need is proven
- Do not keep temporary draft markdown files at repo root once rules/workflows are installed in the workspace and the skill file exists in .skills/