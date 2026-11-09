---
id: TASK-381
title: 'logging: release the Go handles of dropped loggers'
status: To Do
assignee: []
created_date: '2026-11-09 09:20'
labels:
  - logging
  - ffi
  - bug
milestone: m-6
dependencies: []
priority: medium
ordinal: 384000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-267 (logging step). Every `Logger` that writes a record creates a Go logger, and nothing closes it, so the Go side keeps one logger per `Logger` object for the life of the process.

Root cause, pkg/@eserstack/logging/logger.ts:

- `#ensureGoHandle` stores each new handle in the module-level `goHandles` map, keyed by category (:85, :188). The map exists for the configure hook (:778-803), which pushes new levels to live handles.
- `clearLoggerCache` (:766-773) empties `loggerInstances` but not `goHandles`, and `config.reset()` calls it, so after `configure({ reset: true })` the map still holds the handles of the dropped loggers.
- No code in logger.ts calls `logClose`; only `createGoLogger` does (go-logger.ts:110). The bridge keeps each logger in `logHandles` until `logClose` deletes it (pkg/@eserstack/ajan/bridge_log.go:207, :325-327).
- `getChild` (:272-278) and `with` (:294-295) return new, uncached `Logger` objects. Each creates its own handle on its first record and replaces the `goHandles` entry of its category, so the earlier handle of that category is no longer reachable from the hook, and a per-request `logger.with({ requestId })` leaves one Go logger per request.

A fix has to keep a logger that a module still holds working: such a logger keeps writing through its own handle after the cache is cleared, so closing its handle on `clearLoggerCache` would send its records to the stderr fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test written first fails before the fix: after `clearLoggerCache()` (or `configure({ reset: true })`), the Go handles of the dropped loggers are closed or reused, checked through the bridge's handle count or a recording fake library
- [ ] #2 A test written first fails before the fix: logging through many `with()` loggers of one category does not leave one Go logger per `with()` call
- [ ] #3 A logger held across `clearLoggerCache()` still writes through Go, tested
- [ ] #4 `configure()` still pushes a new level to every live handle of a configured category, tested
- [ ] #5 `pnpm ok` passes
<!-- AC:END -->
