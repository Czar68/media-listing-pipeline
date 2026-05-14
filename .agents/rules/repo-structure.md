# Repository Structure Rules

## Package Boundaries — Never Cross
- core-domain: base types only, zero external dependencies
- core-condition: grading engine, no eBay knowledge
- core-identity: identity resolution, no condition or eBay knowledge
- scan-ingestion: intake pipeline, no pricing or listing logic
- identity-application: operator boundary, audit records only
- ebay-adapter: ALL eBay API logic lives here and ONLY here

## File Ownership Per Session
- One agent owns one package or module at a time
- No two agents write to the same file simultaneously
- If a file needs changes from two agents, one waits for the other to merge first

## Required Per Package
- index.ts (exports only)
- types.ts (types for that package)
- __tests__/ directory with at least one test file

## Config Files — Human Controlled, Never Agent Modified
- config/ebay_config.yaml
- .env files
- data/listings.db (use db-client wrapper only)
