---
id: TASK-330
title: Fix the TypeScript noskills dashboard bugs found while porting it to Go
status: Done
assignee: []
created_date: '2026-10-25 08:31'
updated_date: '2026-10-25 08:53'
labels:
  - noskills
  - bug
dependencies: []
priority: low
ordinal: 333000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-265; the Go dashboard (noskillsserverfx) already behaves except where noted. (1) routes/pages.ts handleSpecDetail renders layout() without the token meta, so every spec-page button gets 403. (2) client.js calls res.json() on the plain-text 403 body, which throws, so no alert appears. (3) dashboard/state.ts getSpecSummary: the catch → readState fallback is dead (readSpecState never throws), so a spec whose state lives only in state.json shows IDLE. (4) dashboard/events.ts watchEvents advances past a half-written last line (the event is lost), slices by a string length derived from a byte offset (breaks on multi-byte splits), and its async lastSize setup races the first poll. (5) appendEvent reads and rewrites the whole events log, so concurrent appends lose events (Go noskillsfx.appendEvent does the same). (6) serveStatic reads every static file as text, corrupting binary files. (7) /spec/:name uses the percent-encoded path as the name and accepts nested names. (8) sw-register.js fetches /api/cert-fingerprint, which the dashboard does not serve. (9) The tab close control is a span inside a button, without keyboard access (kept in Go because client.js depends on the markup).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each item has a failing test and is fixed, or is documented as intended; items that TASK-266 makes moot by deleting the TS dashboard are closed with that note
- [x] #2 appendEvent appends without rewriting the log, in TS and Go
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent; make ok and deno task cli ok passed here). All 9 items are fixed, each with a test that failed first. Go had items 2, 3, 5, 8 and 9 too and is fixed:
(1) The spec page carries the token.
(2) client.js reads the action result as text, then JSON (readActionResult), and reports network failures.
(3) getSpecSummary picks the state as resolveState does (Go summaryState).
(4) openEventTail counts bytes, keeps a half-written line and waits for setup before the first poll.
(5) appendEvent appends (TS writeTextFile append, Go O_APPEND, one write per line); 40 concurrent appends all survive.
(6) serveStatic reads bytes (routes/static.ts).
(7) /spec/:name decodes and validates the name.
(8) sw-register.js fetches /api/cert-fingerprint only on https pages (the daemon's HTTP/3 page serves it; the dashboards are plain HTTP on loopback).
(9) Tab select and close are sibling buttons with accessible names, and the add button is 'New tab'.
Left: the TS /api/spec/:name/... routes still use the encoded name, because decoding needs validation first; the Go README states it.
<!-- SECTION:NOTES:END -->
