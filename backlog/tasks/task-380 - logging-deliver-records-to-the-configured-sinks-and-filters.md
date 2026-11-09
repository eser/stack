---
id: TASK-380
title: 'logging: deliver records to the configured sinks and filters'
status: To Do
assignee: []
created_date: '2026-11-09 09:20'
labels:
  - logging
  - laroux
  - bug
milestone: m-6
dependencies: []
priority: high
ordinal: 383000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-267 (logging step). `Logger` never calls the sinks or filters that `configure()` registers. A record goes to the Go logger (`logCreate`, `logWrite`) or, when Go fails, to the stderr fallback, and nowhere else. Checked on 2026-11-09 with the README's record collector example plus a filter that logs when it is called: `records.length` is 0 and the filter never runs, with the native library loaded (Go writes the record as a JSON line) and with `ESER_AJAN=disabled` (the stderr fallback writes the line).

Root cause, pkg/@eserstack/logging/logger.ts:

- `Logger.log` (:358) resolves the effective config through `config.getEffectiveConfig` (:147), which maps the configured names to the sink and filter functions, but reads only `lowestLevel` from it (:370).
- It then calls `#emit` (:396), which writes through `#writeToGo` (:202) or `writeFallbackRecord` (:255). Nothing calls `effectiveConfig.sinks` or `effectiveConfig.filters`.
- v4.5.2's logger.ts has no call of a sink or a filter either, so this predates TASK-267.

Who gets nothing:

- The README section "Testing with Record Collector" (pkg/@eserstack/logging/README.md:358-382) asserts `records.length === 1`.
- laroux: pkg/@eserstack/laroux-server/commands/build.ts:233 and main.ts:130 configure `logging.sinks.getOutputSink(...)`, which never receives a record, so laroux's log output is whatever Go or the fallback writes.
- Every other sink (`getBufferedSink`, `fingersCrossedSink`, `getTestSink`, `withFilter`) and every filter in filters.ts.

The laroux browser shim calls the sinks and filters it resolves (pkg/@eserstack/laroux/config/logging-browser-shim.ts:128-175), so the two packages disagree on what `configure()` means.

Questions to settle here:

1. Where a record goes when sinks are configured: to the sinks only, or to the sinks and Go. The record path stays synchronous (M2-T8), and a sink that returns a promise must not reject into the caller.
2. `parentSinks: "override"`. The resolution reads the matching configs from the most specific outward, and an override config clears the sink names gathered so far: pkg/@eserstack/logging/resolve-config.ts:76-79 and pkg/ajan/logfx/category_config.go:78-79. So override on an ancestor drops the sinks of the more specific configs, and on the most specific config it clears nothing. pkg/@eserstack/logging/types.ts:69 describes it as how to handle parent sinks, and the browser shim stops at the override config instead (logging-browser-shim.ts:159-161, pinned by "parentSinks override keeps the sinks of less specific configurations out" in logging-browser-shim.test.ts:302). logfx/testdata/category_configs.json pins the current Node behavior in three cases ("override on the most specific config clears nothing gathered yet", "override on an ancestor clears the sinks of more specific configs", "override without sinks clears nothing"). Decide which meaning is right; a change moves Go, the TypeScript fallback, the fixture and the shim together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test written first fails before the fix: the README's record collector example collects the record, and a configured filter that rejects a record keeps it from the sink
- [ ] #2 The owner has decided where a record goes when sinks are configured (sinks only, or sinks and Go), and the README says it
- [ ] #3 The owner has decided what `parentSinks: "override"` means; logfx, resolve-config.ts, category_configs.json and the browser shim agree, tested
- [ ] #4 `laroux build` writes its log lines through the `getOutputSink` it configures, tested with and without `ESER_AJAN=disabled`
- [ ] #5 `log()` still writes the record before it returns, and a sink that throws or rejects does not fail the caller, tested
- [ ] #6 `pnpm ok` passes
<!-- AC:END -->
