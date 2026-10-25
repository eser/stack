---
id: TASK-300
title: 'laroux: /ssr for Flight injection, zero-JS buffering, nonces and bot rendering'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-283
  - TASK-284
  - TASK-293
priority: medium
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 4.5, 8.3 and 17. `/ssr`: injectFlightIntoHtml with escaping and the nonce; the SSR consumer manifest and loaders (normal, with ReactDOM.preloadModule for non-alias references); zero-JS buffering with framework references excluded and the first-reference flush; `js: "none"` errors; nonce threading into Fizz and the rsdw edge client; onAllReady rendering for crawler user agents with an overridable list. Follow SA15 and S-I5.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4h. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Snapshot tests show markers, data-when, the pre-hydration script, no modulepreload for aliases and a nonce on every inline script
- [ ] #2 A page with only never() or server-only islands emits no script, and a page with one user reference flushes the buffered Flight
- [ ] #3 A crawler user agent gets the onAllReady HTML with stream-mode Defer content inline
- [ ] #4 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
