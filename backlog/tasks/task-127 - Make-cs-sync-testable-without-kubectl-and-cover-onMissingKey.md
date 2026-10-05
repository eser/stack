---
id: TASK-127
title: Make cs sync testable without kubectl and cover onMissingKey
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - cs
  - test
dependencies: []
references:
  - pkg/@eserstack/cs/sync.ts
  - pkg/@eserstack/cs/sync.test.ts
priority: low
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sync() in pkg/@eserstack/cs/sync.ts:262 calls executeKubectl (line 103) directly, so the sync tests depend on whether kubectl is installed and accept either outcome. Nothing tests SyncOptions.onMissingKey (line 278). Rule: architecture-guidelines: What to Test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The kubectl key lookup is injectable through SyncOptions or a lower-level function
- [x] #2 A test shows a key missing from the environment calls onMissingKey and is left out of the patch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-a: SyncOptions.getResourceKeys defaults to executeKubectl. sync.test.ts covers onMissingKey and checks that the missing key is left out of the patch, with no kubectl. All 49 cs tests pass. The cs CLI wires onMissingKey to a stderr warning, and the cs README documents getResourceKeys, onMissingKey and cwd.
<!-- SECTION:NOTES:END -->
