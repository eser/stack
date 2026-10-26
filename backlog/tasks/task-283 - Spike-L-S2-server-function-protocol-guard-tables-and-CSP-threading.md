---
id: TASK-283
title: 'Spike L-S2: server function protocol, guard tables and CSP threading'
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
ordinal: 283000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spikes SA1, SA2, SA4, SA10, SA11, SA14 and SA15, on the L-S1 prototype.
- SA1: the v1 envelope with `tree` in one Flight stream with temporary references; commit in the same transition; useOptimistic revert; the useActionState queue; parallel actions never carry a tree.
- SA2: progressive enhancement through laroux's own stubs: `$ACTION_ID_`, `$ACTION_REF_`, the permalink and `$ACTION_KEY`, decodeAction and decodeFormState, hydrateRoot formState, getActionResult for unbound actions, the state-mode prevState marker on the no-JS path.
- SA4: a byte-counting stream plus request.formData() on Node and workerd, memory at the caps, resolveBodyCap before any read.
- SA10: fuzz decodeReply with arraySizeLimit 1e5 and record CPU per request on Node and workerd; decide whether Node needs a decode worker pool.
- SA11: in-process redirect render with cookies set before the redirect and the target route's proxy.ts running.
- SA14: record Sec-Fetch-Mode, Dest and Site for HTML form POSTs (JS off, before hydration, React's form replay, inside a same-origin iframe) and for fetch calls to `_.rsc`, in Chromium, Firefox and WebKit, driven by Playwright (decision-57).
- SA15: nonce threading through Fizz, the rsdw edge client, inline Flight, the bootstrap and the pre-hydration script, with no CSP violations on streamed pages.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-293, TASK-295, TASK-296, TASK-299, TASK-300.

Plan key: L-S2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SA1, SA2, SA4 and SA11 results are recorded with the fixture code
- [ ] #2 SA10 records CPU per request for the fuzz corpus on both targets and a decision on a Node decode pool
- [ ] #3 SA14 records the observed Fetch Metadata for every case in three browsers, and doc-3 section 5's table is updated to match
- [ ] #4 SA15 shows zero CSP violations on a streamed page with islands
- [ ] #5 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
