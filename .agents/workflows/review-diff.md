---
name: review-diff
description: Review current code diff before merge. Check for invariant violations.
---

Review the current diff against:
1. Does any change touch pricing math without a corresponding test change?
2. Does any change modify core-condition or core-identity without updating types.ts?
3. Is there any direct eBay API call outside of the ebay-adapter package?
4. Is there any place where condition could be inferred or defaulted?
5. Are there any `any` types introduced in core packages?
6. Does listings.db get written directly instead of through db-client?
7. Does MASTER_OUTLINE.md need updating based on what was completed?

Report each violation with file name and line number.
If no violations: confirm the diff is clean and clear to merge.
