---
id: TASK-26
title: Bound request bodies in the @eserstack/http request adapter
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - security
  - http
dependencies: []
references:
  - pkg/@eserstack/http/adapter.ts
priority: high
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/http/adapter.ts:30,32 fromRequest() calls req.json()/req.text() on every non-GET request with no size limit, so one large or chunked request can exhaust memory in any server built on @eserstack/http. Rule: security-practices http-and-auth.md: Layered Controls (request body limit) and coding-practices: Bound Every Resource.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bodies above a configurable limit (default in the options) are rejected with 413 before parsing, including chunked bodies without Content-Length
- [x] #2 Tests cover the limit with and without Content-Length
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

small-b1: Verified in pkg/@eserstack/http/adapter.ts. A Content-Length over the limit is rejected before any read, and the stream is cancelled. A chunked or understated body is counted as it is read and cancelled once it passes the limit. RequestBodyTooLargeError has status 413, and maxBodyBytes defaults to DEFAULT_MAX_BODY_BYTES (1 MiB). adapter.test.ts covers both paths, the boundary, an endless stream, malformed headers and the default. No fromRequest callers exist elsewhere in the repo.
<!-- SECTION:NOTES:END -->
