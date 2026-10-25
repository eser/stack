---
id: TASK-183
title: 'posts: run the OAuth callback server on runtime.http'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:44'
labels:
  - posts
  - http
milestone: m-0
dependencies:
  - TASK-180
priority: medium
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
adapters/tui/callback-server.ts:105-198 has two branches: Deno.serve, and a dynamic node:http import for other runtimes. Replace both with one runtime.http.serve call that takes hostname, port and an abort signal.

Plan key: M0-T10. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 callback-server.ts has no runtime.name check, no Deno.* and no node:http import
- [x] #2 Callback server tests pass
- [x] #3 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. waitForOAuthCallback is now one async function on runtime.http.serve with the expectation's loopback hostname and port and an AbortSignal; the Deno.serve branch, the node:http branch and the runtime.name dispatch are gone. A runtime without runtime.capabilities.http rejects with the same message, which browser-login already turns into the manual-entry fallback; a bind failure rejects from serve. The server stops after the genuine redirect or the timeout, and the function returns only after server.finished. New test: the receiver times out with the timeout message (the test's resource sanitizer covers the stopped listener). The existing foreign-request and loopback-bind tests pass; posts 50 tests pass. deno task cli ok passed.
<!-- SECTION:NOTES:END -->
