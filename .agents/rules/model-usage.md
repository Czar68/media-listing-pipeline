# Model Usage Rules — Protect Allotments

## Default
Always start in Fast mode with Gemini Flash.
Escalate only when task is complex or Flash has failed twice.

## Gemini Pro (Planning Mode Only)
Use when:
- Designing a new module from scratch touching multiple packages
- Any architecture decision not already in MASTER_OUTLINE.md
- Complex multi-file refactors
- Flash has failed or produced structurally wrong output twice

## Claude Sonnet
Use when:
- Pricing formula logic — must be exact
- eBay API payload assembly — mistakes cost money
- Any function where a subtle bug corrupts listings data
- Reviewing diffs before merge on financial or identity logic

## Gemini Flash (Fast Mode)
Use when:
- Boilerplate, scaffolding, renaming, reformatting
- Writing or fixing tests
- JSON and config files
- Iterating on listing copy prompts
- Scripts that run once
- Any well-defined single-file task

## Hard Rules
- Never run more than 1 Gemini Pro agent simultaneously
- Never run more than 2 Sonnet agents simultaneously
- Flash can fill all remaining agent slots
- When unsure: use Flash first
