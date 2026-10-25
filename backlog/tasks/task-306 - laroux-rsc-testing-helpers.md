---
id: TASK-306
title: 'laroux: /rsc/testing helpers'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-295
  - TASK-298
  - TASK-302
priority: medium
ordinal: 306000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 21. callAction(fn, input, { cookies, session, locals, origin, path, locale }) returning { data, error, effects }; submitForm(page, formData); createTestRequest(), which, like callAction, sends same-origin Origin and Fetch Metadata headers by default (decision-60); an in-memory HostContext with memory cache, session and rate-limit adapters; and helpers to render a Defer target with given props and scope.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4n. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each helper has tests and a README example, and the security regression suite uses them where it can
- [ ] #2 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
