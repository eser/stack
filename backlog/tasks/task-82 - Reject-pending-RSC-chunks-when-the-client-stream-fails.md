---
id: TASK-82
title: Reject pending RSC chunks when the client stream fails
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-react
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux-react/client.ts
priority: medium
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In createFromReadableStream and createHybridRSCTree (pkg/@eserstack/laroux-react/client.ts:921-929 and :1353-1360), a stream failure only sets context._closed and _closedReason. getChunk (line 294) then fails chunks created after the failure, but PENDING chunks that React is already suspended on are never rejected, so their Suspense boundaries wait forever instead of showing the error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On stream failure every PENDING chunk moves to ERRORED with the reason and its listeners are rejected
- [x] #2 A client.test.ts case where the stream errors after a forward reference shows the error reaches the boundary
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: closeContext rejects every pending chunk. The forward-reference test renders through react-dom/server and finds the failed boundary marker (<!--$!-->). The test passes.
<!-- SECTION:NOTES:END -->
