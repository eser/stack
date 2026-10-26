---
id: TASK-288
title: 'Spike L-S7: skew, key rotation and codec robustness'
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
ordinal: 288000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 22, spikes S13, SA9 and S-I12.
- S13 and SA9: build N, open a page, build N+1 with a changed component, a moved action and a changed flags byte, deployed with `--keep-assets 1`. From the open page run an unchanged action, a bound-argument action, the moved action, a navigation that loads a new lazy chunk, and a fetch-mode island. Repeat with a key rotation (new key second, then first, then the old kid retired) and with prerendered and dynamic seals. Check the one-shot reload guard against a CDN-cached old shell.
- S-I12: property-based tests of the island props codec against hostile input, timing-safe MAC comparison on WebCrypto, rotation, and the build-kid startup check.

Run everything in the scratchpad on the pinned Node 26 minor; nothing lands in the repo. Record the results in this task's notes and update doc-3 where they change the design. Gates: TASK-293, TASK-298.

Plan key: L-S7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 S13 records which calls succeed, which reload once and which fail, for each case
- [ ] #2 The rotation order in doc-3 section 6.2 is confirmed or corrected
- [ ] #3 S-I12 freezes codec v1 or lists the changes it needs
- [ ] #4 doc-3 is updated where a result changes the design, and every gated task names the result it depends on
<!-- AC:END -->
