---
id: TASK-284
title: 'Spike L-S3: islands on react-dom 19.3.1'
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
ordinal: 284000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spikes S-I2, S-I3, S-I4, S-I5 and S-I10, on the L-S1 prototype.
- S-I2: a root context change inside and outside a transition, new parent props, a navigation transition with never() islands, an action that returns a tree (doc-3 section 8.4), StrictMode, and root retries after a recoverable error. Validate the second-render self-open rule, waiting on chunks inside transitions, SavedHtml capture and segment-level mismatch containment.
- S-I3: interaction capture and replay, native-default targets left alone, opt-in submit with requestSubmit, the watchdog with a blocked or failing chunk and its disarm rule, React's form replay skipped, nested islands.
- S-I4: a 5,000-node article with one island, measured as laroux single root, laroux with never() around the article, and Astro 7.4 with client:visible: HTML plus inline Flight bytes, TBT and hydration time on a throttled mobile profile.
- S-I5: zero-JS detection with framework references excluded, buffering, first-reference flush timing, Fizz reveal scripts under `auto`, zero scripts under `none`.
- S-I10: `<laroux-island>` inside p, li, table rows and select; useId stability; the visible() descendant walk.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-297.

Plan key: L-S3. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 S-I2's matrix is recorded case by case, including the action-refresh case
- [ ] #2 S-I3 and S-I5 results are recorded, and the default interaction events and js mode are confirmed or changed in doc-3
- [ ] #3 S-I4's byte and timing table is recorded against Astro
- [ ] #4 S-I10 decides the marker element and whether an `as` prop is needed
- [ ] #5 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
