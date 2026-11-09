---
id: TASK-381
title: 'logging: release the Go handles of dropped loggers'
status: Done
assignee: []
created_date: '2026-11-09 09:20'
updated_date: '2026-11-09 10:00'
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
- [x] #1 A test written first fails before the fix: after `clearLoggerCache()` (or `configure({ reset: true })`), the Go handles of the dropped loggers are closed or reused, checked through the bridge's handle count or a recording fake library
- [x] #2 A test written first fails before the fix: logging through many `with()` loggers of one category does not leave one Go logger per `with()` call
- [x] #3 A logger held across `clearLoggerCache()` still writes through Go, tested
- [x] #4 `configure()` still pushes a new level to every live handle of a configured category, tested
- [x] #5 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause, pkg/@eserstack/logging/logger.ts before the fix: `#ensureGoHandle` (:165-196) opened a Go logger per `Logger` object and kept only the latest handle of a category in `goHandles` (:85, :188); `clearLoggerCache` (:766-773) never closed any, nothing in logger.ts called `logClose`, and `with()` (:294) and `getChild()` (:272) return new loggers, so each per-request logger opened its own Go logger. The configure hook (:778-803) reached only the latest handle of a category.

Go side: a bridge logger (pkg/@eserstack/ajan/bridge_log.go, `logEntry`) holds only the scope name, the level and the filter and formatter set by `logConfigure`; properties travel with each `logWrite`, and the entry is safe for concurrent writes. Sharing a handle between loggers of one category and level is therefore safe, and `logClose` only deletes the entry and is idempotent. No bridge name changed.

Fix (logger.ts):

- `goHandles` (:95) maps a category key to the handles of that category, one per Go level. `#ensureGoHandle` (:204) reuses the handle of its category and effective level and creates one only when none exists, so `with()` and `getChild()` loggers no longer open a Go logger each.
- `clearLoggerCache` (:819) calls `closeGoHandles` (:105), which sends `logClose` for every handle, empties the map and bumps `goHandleGeneration` (:102). A logger whose handle is from an older generation takes a current one on its next record, so a logger a module still holds keeps writing through Go. Deterministic: no FinalizationRegistry.
- The configure hook (:853) pushes the new level to every handle of the category and records it on the entry.
- The record path stays synchronous; the hot path adds one integer compare. Sink, filter and `parentSinks` handling are unchanged (TASK-380).

Tests (pkg/@eserstack/logging/logger.test.ts, through a recorder that passes every call to the real library and asks Go with `logShouldLog`), all five failing before the fix:

- `clearLoggerCache() closes the Go handles of the loggers it drops` and `configure({ reset: true }) closes ...` (:353): no `logClose` was sent before; now both handles are closed and Go answers "log handle not found" (AC1).
- `Logger.with() and getChild() loggers of one category share one Go handle` (:380): 25 handles before, 2 now, no write errors, no console fallback (AC2).
- `a logger held across clearLoggerCache() still writes through Go` (:412): writes after the clear succeed through an open handle with no fallback line (AC3).
- `configure() pushes a new level to every live Go handle of a configured category` (:437): before, only the latest of two handles got `logConfigure`; now both do and Go reports WARN disabled on each (AC4).

Also checked: all logging tests pass with `ESER_AJAN_NATIVE=disabled` (WASM backend), and the `ESER_AJAN=disabled` child in bridge.test.ts passes. WIRING.md records the fix. `pnpm ok` passes (AC5). No CHANGELOG entry: nothing for a user to act on.
<!-- SECTION:NOTES:END -->
