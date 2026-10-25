---
id: TASK-97
title: Pass request data to laroux pages or drop renderApp's requestContext
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - laroux-server
  - feature
dependencies: []
references:
  - pkg/@eserstack/laroux-server/adapters/react/render-app.tsx
  - .agents/skills/frontend-practices/references/laroux.md
priority: medium
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
renderApp in laroux-server adapters/react/render-app.tsx:20-24 accepts requestContext ({ cookieHeader, host, localeParam }) from server.ts and renderer.ts but never passes it to the Layout or Page (lines 41-46), so pages cannot read cookies or the host. With the module-level cookie store gone (TASK-66 item 4), either pass this data explicitly or through a request-scoped context, or remove the parameter from this public export. Rules: frontend-practices: No Request State in Module Scope, Per-Request Data Under laroux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pages receive request data through a documented prop or request-scoped context, or requestContext is removed from renderApp
- [x] #2 frontend-practices references/laroux.md 'Per-Request Data Under laroux' matches the result
- [x] #3 A test covers concurrent requests with different cookies if the data is passed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

AC #2 is met. 'Per-Request Data Under laroux' matches laroux/router/page-request.ts: request prop on page and layout, cookies a ReadonlyMap of decoded values, host and locale null when missing. The Correct example uses laroux.PageProps and checks for undefined.
<!-- SECTION:NOTES:END -->
