---
id: TASK-287
title: 'Spike L-S6: partial prerendering on Node and workerd'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - spike
  - track-l
milestone: m-7
dependencies:
  - TASK-189
priority: high
ordinal: 287000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spike S-I7. decision-54 puts partial prerendering in R1, so this spike decides how it ships, not whether; if it cannot work, record why and stop for the owner.
- Build: Flight prerender with dynamic APIs postponed, Fizz prerender with abort, the prelude and the postponed state.
- Request: stream the prelude, render Flight in full (no Flight resume in rsdw 19.3.1), then react-dom resume, on Node and in `wrangler dev`.
- Measure prelude TTFB, the full re-render cost, mismatches after data changes, and postponed-state size; decide where it is stored on Workers (bundled under a size budget, or a blocked static path).
- CSP with prelude hashes plus a nonce for the resumed part.
- A dynamic API outside any Suspense boundary on a partial route must be detectable at build time.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-301, TASK-309.

Plan key: L-S6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The prelude plus resume works on Node and in `wrangler dev`, or the failure is recorded and the owner is asked
- [ ] #2 The measurements and the Workers storage choice are recorded
- [ ] #3 The CSP approach for partial routes is confirmed or nonce mode is refused on them
- [ ] #4 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
