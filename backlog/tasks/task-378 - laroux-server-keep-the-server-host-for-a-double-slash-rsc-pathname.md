---
id: TASK-378
title: 'laroux-server: keep the server host for a double-slash /rsc pathname'
status: Done
assignee: []
created_date: '2026-11-08 10:00'
labels:
  - laroux
  - security
  - bug
milestone: m-7
dependencies: []
priority: high
ordinal: 381000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-377. `GET /rsc?pathname=` runs the proxy chain with a request for the page it names, and `createHandler` built that request by resolving the pathname against the origin. A pathname of `//evil.com/x`, `///evil.com/x` or `/\evil.com/x` resolved to `http://evil.com/x`, so the client picked the host of the request the proxies saw, and a proxy that reads `request.url` saw the path `/x` instead of the one it was asked to guard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The proxy request of `/rsc` keeps the server host for double-slash, triple-slash and backslash pathnames, and its path matches the pathname the proxies get, tested
- [x] #2 The existing `/rsc` proxy cases are unchanged
- [x] #3 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: `pkg/@eserstack/laroux-server/runtime/server.ts`, the proxy request of `/rsc` was `new Request(new URL(rscPagePathname, url.origin), req)`. A pathname that starts with `//` is a scheme-relative reference, so it replaced the host. The fix sets the pathname on a copy of the origin instead, as the normalization a few lines above already does. The render itself only uses the pathname string, so it was not affected.
<!-- SECTION:NOTES:END -->
