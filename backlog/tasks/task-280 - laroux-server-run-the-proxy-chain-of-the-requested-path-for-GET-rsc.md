---
id: TASK-280
title: 'laroux-server: run the proxy chain of the requested path for GET /rsc'
status: Done
assignee: []
created_date: '2026-10-24 01:30'
updated_date: '2026-10-24 16:37'
labels:
  - laroux-server
  - security
milestone: m-0
dependencies: []
priority: high
ordinal: 280000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the shipping pipeline, the proxy.ts chain runs for the request pathname (pkg/@eserstack/laroux-server/runtime/server.ts:393-408). For `GET /rsc?pathname=/admin` that pathname is `/rsc`, so the route-scoped proxies of `/admin` never run, and the page renders through `getApp(requestPathname)` at :542-555 without them. A client can read any page's server component output past its proxy this way. Found by reading the code in the laroux design run (2026-10-23), not reproduced yet; doc-3 section 26 lists it.

First write a failing test: a fixture with `src/app/routes/admin/proxy.ts` that returns 403, and a GET /rsc?pathname=/admin that must get 403. Then run the proxy chain for the `pathname` search parameter before rendering, apply its rewrite and redirect results the same way the document path does, and keep the root chain.

POST /_rsc has the same gap, because an action carries no page path. Do not invent one here: document in the laroux-server README that route-scoped proxies do not cover POST /_rsc until track L's route binding (doc-3 section 7.4), and add a test that the root proxy chain runs for it. Rules: security-practices (authorization).

Plan key: L-INT1. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test shows GET /rsc?pathname=/admin gets the 403 from admin/proxy.ts, and a GET /rsc for a path without a scoped proxy still renders
- [x] #2 A test shows the root proxy chain runs for POST /_rsc, and the README states the route-scoped limitation with a pointer to doc-3 section 7.4
- [x] #3 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: runtime/server.ts ran the proxy chain for the request pathname, which is /rsc for GET /rsc?pathname=..., so route-scoped proxies of the page never ran. Now for /rsc the chain runs once, for the page path (normalized through URL, so /x/../admin is /admin) with a Request whose URL is the page URL; a rewrite changes the rendered page and a redirect or response ends the request as on the document path. Tests with a real MiddlewareDispatcher and proxy-registry fixture: /admin, /admin/users and /x/../admin get the 403 from the admin proxy, /about renders; POST /_rsc runs the root chain. README states that route-scoped proxies do not cover POST /_rsc until doc-3 section 7.4. Full gate: deno task cli ok passed on 2026-10-24 (34 steps).
<!-- SECTION:NOTES:END -->
