---
name: generate-tests
description: Generate tests for the current file or package.
---

Generate comprehensive tests for the specified file:
1. Unit tests for every exported function
2. Edge cases: empty input, null, malformed data
3. Pricing functions: test boundary conditions and fee formula
4. eBay adapter: mock the API call, test payload structure exactly
5. Condition logic: test all 3 condition types and blocking behavior
6. Name test files matching source file with .test.ts suffix
7. All tests must pass before marking task complete
