---
id: TASK-36
title: Evict stale entries from the push coalescing map
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
  - noskills
dependencies: []
references:
  - pkg/ajan/noskillsserverfx/push.go
priority: medium
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/noskillsserverfx/push.go:185,302 writes pd.coalesce[sid:kind] on every Dispatch and never deletes, so the map grows for the life of the daemon. Rule: coding-practices: Bound Every Resource.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Entries older than pushCoalescePeriod are removed
- [x] #2 A test shows the map does not grow past the active keys
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-server: Verified: on each allow call, pushCoalescer.allow removes entries whose age is at least the period (maps.DeleteFunc). TestPushCoalescerForgetsKeysPastTheirPeriod shows the map drops from 100 keys to 1.
<!-- SECTION:NOTES:END -->
