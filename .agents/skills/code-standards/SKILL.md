---
name: code-standards
description: TypeScript standards and patterns for this codebase. Load when writing or reviewing code.
---

## TypeScript
- Strict mode always
- No `any` in core packages
- Explicit return types on all exported functions
- Zod for runtime validation on all external data

## Error Handling
- All errors are typed — no throwing raw strings
- External API failures: log, add to failed queue, continue pipeline
- One failed item never stops the batch

## Naming
- Files: kebab-case
- Types/Interfaces: PascalCase
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Database fields: snake_case

## Package Pattern
- Exports only from index.ts
- Internal modules not exported
- Types crossing package boundaries live in core-domain

## Logging
- All agent output: artifacts/logs/<module>_<date>.json
- Structure: { timestamp, input_snapshot, output, model_used, tokens_used }
- Failed items: reports/failed_<module>_<date>.csv with reason column
