---
id: TASK-296
title: 'laroux: /browser client runtime and the client router'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-283
  - TASK-293
priority: medium
ordinal: 296000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 4.2, 4.4, 4.6, 7.4 and 8.4.
- callServer posting to `<current path>/_.rsc`, reading flags from the id; queries by GET to `_.query`; the serial queue with navigation preempting and the parallel bypass; tree commit in a transition; `invalidate` handling that refetches matching fetch-mode islands and evicts matching prefetched `_.rsc` payloads, and a full prefetch-cache clear on any `tree`
- the shared one-shot skew reload guard keyed by server build id
- `client.fetchHeaders` applied to every framework fetch
- the router in `/client`: Link (with `locale`), Form for GET navigation, navigation through createFromFetch in startTransition with useSyncExternalStore stores, link prefetch (hover, viewport, tap, load, Save-Data aware), releasing dehydrated retained-layout island chunks before a navigation or action-tree commit
- the state-mode prevState marker

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4d. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests cover the queue (a parallel action cannot return a tree), navigation preemption and an in-flight call across a navigation
- [ ] #2 A test shows an action's `invalidate` evicts a prefetched payload and refetches only matching islands
- [ ] #3 A test shows a 409 reloads once and a second 409 after the reload surfaces ACTION_UNAVAILABLE without reloading
- [ ] #4 A test shows fetchHeaders reaches action, navigation, query and island requests
- [ ] #5 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
