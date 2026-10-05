---
id: TASK-130
title: Implement or remove certHashes in httpclient createH3FetchFn
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpclient
  - bug
dependencies: []
references:
  - pkg/@eserstack/httpclient/h3-fetch.ts
priority: medium
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
H3FetchOptions.certHashes is documented as certificate pinning that bypasses CA validation (pkg/@eserstack/httpclient/h3-fetch.ts:37-45), but createH3FetchFn ignores its options and returns the global fetch (lines 62-75). A caller who relies on pinning gets ordinary CA validation instead. Rule: documentation-conventions: Claims Need Evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 certHashes is implemented with a test, or removed with the JSDoc describing what the function does
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked: createH3FetchFn() takes no arguments, and H3FetchOptions is removed. The JSDoc now describes what the function does: it returns the global fetch bound to globalThis and pins nothing. h3-fetch.test.ts covers delegation, the binding and the missing-fetch error. No caller elsewhere in the repo passes certHashes.
<!-- SECTION:NOTES:END -->
