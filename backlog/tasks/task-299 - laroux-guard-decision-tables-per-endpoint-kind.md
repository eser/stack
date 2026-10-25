---
id: TASK-299
title: 'laroux: /guard decision tables per endpoint kind'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - security
  - track-l
milestone: m-7
dependencies:
  - TASK-283
priority: medium
ordinal: 299000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 5. guardActionRequest(request, policy, kind) for `rsc`, `query`, `json`, `island` and `form-page`, with the GET split for queries and islands, full-origin comparison, trustProxy, the per-action headerless opt-in and the iframe rule. The tables follow SA14's browser results (L-S2). Pure and dependency-free, so laroux-server can call it too.

Per decision-60, unsafe requests with neither Origin nor Fetch Metadata get 403 FORBIDDEN unless the action sets `headerless: "allow"`, and in dev each rejection logs one line naming the action, the missing headers and the opt-in.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4g. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Table-driven tests cover every row of doc-3 section 5 for each kind
- [ ] #2 A test shows a navigate-mode request to `_.rsc` fails and a navigate-mode document form POST from a same-origin iframe passes
- [ ] #3 A test sends a headerless POST to an action and gets 403 FORBIDDEN with the dev log line, and the same request passes for an action with `headerless: "allow"`
- [ ] #4 The laroux README documents the new API with examples and has a section on requests without Origin or Fetch Metadata: the endpoints that reject them, the 403 response and its code, the dev log line, the CSRF reason, how curl, scripts and server-to-server callers send an Origin header, and the cost of `headerless: "allow"`
- [ ] #5 The gate passes
<!-- AC:END -->
