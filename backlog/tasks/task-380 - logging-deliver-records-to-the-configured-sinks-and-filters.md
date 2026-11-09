---
id: TASK-380
title: 'logging: deliver records to the configured sinks and filters'
status: Done
assignee: []
created_date: '2026-11-09 09:20'
updated_date: '2026-11-09'
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
- [x] #1 A test written first fails before the fix: the README's record collector example collects the record, and a configured filter that rejects a record keeps it from the sink
- [x] #2 The owner has decided where a record goes when sinks are configured (sinks only, or sinks and Go), and the README says it
- [x] #3 The owner has decided what `parentSinks: "override"` means; logfx, resolve-config.ts, category_configs.json and the browser shim agree, tested
- [x] #4 `laroux build` writes its log lines through the `getOutputSink` it configures, tested with and without `ESER_AJAN=disabled`
- [x] #5 `log()` still writes the record before it returns, and a sink that throws or rejects does not fail the caller, tested
- [x] #6 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decisions, 2026-11-09. (1) When sinks are configured for a record's category, the record goes to those sinks only, after the configured filters; without sinks it goes to Go as before, or to the stderr fallback without the bridge. (2) `parentSinks: "override"` on a config that names sinks means that config takes no sinks from less specific (ancestor) configs: the gathering from the most specific config outward stops at the override config. This is the browser shim's meaning (logging-browser-shim.ts:159-161) and what types.ts describes. The shim stops gathering filters at the same config, so filters follow the same rule; the level still comes from the most specific config that sets one, override or not.

Tests first (AC #1, #5): logger.test.ts gained the README record collector example, a rejecting filter (it is called and the sink gets only the passing record), the record's fields (message, rawMessage, severity, category, args, properties from with(), context from withContext()), sinks only (no logWrite, no stderr line), a category without sinks still on Go or the fallback, delivery before log() returns (records.length is 1 before the promise is awaited), a logger taken before configure() writing to the new sinks, a throwing sink and a rejecting sink (the caller gets its value, the other sink gets both records, each failing sink is called once per record and reported once on stderr), and a throwing filter (record dropped, reported once). Eight of them failed before the fix (records.length 0, filter never called); the category-without-sinks test passed, as it pins the unchanged path. laroux-server commands/build.test.ts runs a failing build in a child process with and without ESER_AJAN=disabled, its log lines going to a buffer through the new runBuild option logSink; both failed before the fix ("Build failed" 0 times in the sink).

Fix at the origin, logger.ts: Logger.log builds the LogRecord and, when the effective config has sinks, calls deliverToSinks synchronously and returns without touching Go. Filters run first and every one must pass; each sink is called in order; a returned promise is not awaited but gets a catch. A throwing or rejecting sink or a throwing filter is reported through reportFault, which writes one stderr line per failing function (a WeakSet, re-armed by clearLoggerCache like the fallback warning) directly with console.error, never through a logger, so it cannot reach the failing sink again. Logger no longer caches the effective config on the instance: config.getEffectiveConfig caches per category and clears on every configure, reset and register call, so a module-level logger (laroux-bundler's buildLogger) held across configure() takes the new sinks instead of the first configuration it saw. The resolution of names stays in Go through logResolveConfig with the TypeScript fallback; only the calling of the functions is in TypeScript.

Override: logfx.ResolveCategoryConfig (pkg/ajan/logfx/category_config.go) and resolveInTypeScript (resolve-config.ts) stop gathering sink and filter names after a config with sinks and parentSinks "override", and keep looking for the level. Fixture category_configs.json: "override on the most specific config clears nothing gathered yet" became "... keeps the sinks of less specific configs out" (want h, was h a); "override on an ancestor clears the sinks of more specific configs" became "... keeps the sinks of more specific configs and stops there" (want r h a, was a root); "override without sinks clears nothing" became "override without sinks does not stop the gathering" with a root sink added (want h root); "filters gather from every matching config without override" became "filters gather from the matching configs up to an override" (want shared h a, was shared h a root); added "override keeps the sinks and filters of its ancestors out but not their level". The bridge's bridge_log_resolve_test.go override case was updated the same way. logging-browser-shim.test.ts gained a test that runs every fixture case through the shim and checks the sinks and filters it calls: it passed unchanged, so the shim already agreed. No bridge names were added or removed.

laroux (AC #4): build.ts takes an optional logSink for the logging output (stdout by default) and flushes that output before reporting the result. The child-process test checks "Build failed" reaches the sink exactly once with the category and the error's message, and that stderr has no "Build failed" line, with the native library and with ESER_AJAN=disabled. Doubled or lost output: none; the laroux-server, laroux and laroux-bundler suites pass (429 tests), and the logging and build tests also pass with ESER_AJAN_NATIVE=disabled (WASM).

Other changes: the Go-path tests in logger.test.ts configure a level and no sinks now (configureFallbackTest), since a configured sink would take their records; bridge.test.ts's ESER_AJAN=disabled child checks the collector receives the laroux-style records, none reach stderr, and a category without sinks writes to the fallback. Docs: the logging README (configure section: the parent rule and where a record goes), WIRING.md (Logger row, laroux notes, fixtures, a Fixed entry, sync path, divergences), types.ts, logfx README, and two Migration bullets under @eserstack/logging in CHANGELOG.md. pnpm ok passes.
<!-- SECTION:NOTES:END -->
