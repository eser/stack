---
id: TASK-308
title: 'laroux-server: runtime/ fetch host'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux-server
  - track-l
milestone: m-7
dependencies:
  - TASK-285
  - TASK-292
  - TASK-293
priority: medium
ordinal: 308000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 3.2, 4.3, 6.2, 11 and 12, and doc-2's laroux-server section. The host bundled into dist/server/index.js, with no React, rolldown, Tailwind or sharp in its graph:
- health, rate limiting on the peer address, static dist/client with ETag, Range, precompressed variants and immutable hashed files, `_prev/<buildId>/`, prerendered `index.html` and `_.rsc` files, and the rule that the static layer never answers framework paths or `x-rsc-action` requests
- resolveBodyCap and the byte-counting body stream with the read deadline
- compression with per-chunk flush, security headers last, upgrade identity
- HostContext construction: env, keyring loading and startup checks (missing keyring, build kids), the memory LRU CacheProvider, the memory session driver wiring, the rate limiter
- graceful shutdown on runtime.http (TASK-292)

The new modules ship beside the old pipeline (additive in 5.x). Rules: javascript-practices, security-practices where the section touches input, keys or output.

Plan key: L5a. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests cover static serving, the framework-path exclusion, the body cap (413 and the read deadline) and each startup failure
- [ ] #2 `node dist/server/index.js` serves the conformance fixture from a directory with no node_modules
- [ ] #3 The laroux-server README documents the change, and the gate passes
<!-- AC:END -->
