---
id: TASK-271
title: 'laroux-server: allow POST /_rsc to call only exported server actions'
status: Done
assignee: []
created_date: '2026-10-15 21:59'
updated_date: '2026-10-24 16:37'
labels:
  - laroux-server
  - security
milestone: m-0
dependencies: []
priority: high
ordinal: 271000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
POST /_rsc runs the export that the RSC-Action header names under dist/server (pkg/@eserstack/laroux-server/runtime/server.ts:423-539). The id comes only from that header (:424-425), and the only check before the call is that the export is a function (:490-494). So any HTTP client can call any exported function of the built server code, not only "use server" actions: an authorization and attack-surface hole, not a CSRF problem. TASK-9 only contained the lookup to dist/server. Found by the laroux design research on 2026-10-16, by reading the code; not reproduced yet.

First write a failing test that calls a non-action export through POST /_rsc (spike S0 of the laroux design). Then:
- call only entries listed in actions-manifest.json whose export carries Symbol.for('react.server.reference');
- cap the request body;
- add an Origin / Sec-Fetch-Site check as defense in depth.
The change is runtime-neutral, so it lands under the current Deno gate before any further release. Rules: security-practices (authorization, input validation, layered controls).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test shows that POST /_rsc naming an exported non-action function is refused with 403 or 404 and the function does not run
- [x] #2 Only exports listed in actions-manifest.json and marked as React server references can be called
- [x] #3 Request bodies above a documented limit are refused with 413
- [x] #4 Cross-site requests are refused by an Origin / Sec-Fetch-Site check, with a test
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New runtime/action-guard.ts. POST /_rsc now: refuses Sec-Fetch-Site other than same-origin/none, or an Origin other than the request's, with 403 (requests with neither header pass: browsers always send one on POST); checks the action module against dist/server/actions-manifest.json (cached per build id) before importing anything, 404 otherwise; reads the body with a 1 MiB cap (ACTION_MAX_BODY_BYTES, Content-Length and streamed bytes), 413 above it; calls the export only when it carries Symbol.for('react.server.reference') with $$id equal to the action id, 404 otherwise. Tests in runtime/server.test.ts: a non-action export in a listed module gets 404 and its side effect never happens; an unlisted module gets 404; 413 for declared and chunked oversized bodies; 403/200 across Fetch Metadata and Origin cases. path-containment.test.ts now lists the outside paths in the manifest so it still reaches the containment check. Checked against a real laroux build: the transform writes $$id 'src/app/actions#addComment' and the manifest lists 'src/app/actions.js', which the check maps to each other. Side finding, not fixed here: the server-action transform also calls Object.defineProperties on non-function exports of a 'use server' file, which throws at import for a primitive export. README Server Actions section documents the checks. Full gate: deno task cli ok passed on 2026-10-24 (34 steps).
<!-- SECTION:NOTES:END -->
