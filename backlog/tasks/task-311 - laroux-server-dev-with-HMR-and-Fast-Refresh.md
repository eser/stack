---
id: TASK-311
title: 'laroux-server: dev/ with HMR and Fast Refresh'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux-server
  - track-l
milestone: m-7
dependencies:
  - TASK-286
  - TASK-309
priority: medium
ordinal: 311000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 18 and decision-51. The dev server on runtime.http with the runner L-S5 chose (worker swap with drain, or a ModuleRunner), the HMR channel, rolldown DevEngine for the client with a DevRuntime implementing import.meta.hot (accept, dispose, data, invalidate, prune, on, send), React Fast Refresh, rsc:update refetching `<path>/_.rsc` with client state kept, action HMR (stub re-emit on flags changes), island HMR (gate release under dehydrated islands, the dev hold policy for module URLs, Defer refetch), the CacheProvider in observe-only mode, the dev keyring, and the error overlay with id-to-name mapping. Workers apps use this Node dev server. If L-S5 shows DevEngine cannot carry this, stop and ask the owner before building the decision-51 fallback.

The new modules ship beside the old pipeline (additive in 5.x). Rules: javascript-practices, security-practices where the section touches input, keys or output.

Plan key: L5d. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An HMR suite runs on every rolldown bump: a client edit keeps state, a server component edit keeps client state, an edit under a dehydrated island, an action flags change and a Defer refetch
- [ ] #2 rolldown is pinned exactly in laroux-server's package.json
- [ ] #3 The laroux-server README documents the change, and the gate passes
<!-- AC:END -->
