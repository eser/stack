---
id: TASK-97
title: Pass request data to laroux pages or drop renderApp's requestContext
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
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
- [ ] #1 Pages receive request data through a documented prop or request-scoped context, or requestContext is removed from renderApp
- [ ] #2 frontend-practices references/laroux.md 'Per-Request Data Under laroux' matches the result
- [ ] #3 A test covers concurrent requests with different cookies if the data is passed
<!-- AC:END -->
