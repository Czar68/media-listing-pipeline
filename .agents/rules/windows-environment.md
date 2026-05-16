# Windows Environment Rules

## Terminal Sandbox Limitation
This workspace runs on Windows. Antigravity terminal sandboxing is not supported.
Agents must NOT attempt to run terminal commands via run_command.

## What Agents Must Do Instead
- Read files directly (view, read_file) instead of running git commands
- Use file contents of PROJECT_STATE.md and MASTER_OUTLINE.md for git history
- Never run: git, pnpm, npm, node, python via terminal
- If validation is needed: write the validation script and tell the human to run it

## What Humans Run Manually
- git commands
- pnpm test / pnpm smoke
- npm run build
- Any CLI validation

## Agent Workflow on Windows
1. Read files to understand state
2. Write or edit code
3. Output a list of commands for human to run manually
4. Human pastes results back if needed
