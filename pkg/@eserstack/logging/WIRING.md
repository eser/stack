# @eserstack/logging — FFI wiring notes

## Bridge calls

The package reaches the Go logger through the dispatcher ABI of
`@eserstack/ajan` (one `EserAjanCall` export; the names and their types are in
`ajan/ffi/bindings.ts`):

| Call               | Request                                       | Answer                                          |
| ------------------ | --------------------------------------------- | ----------------------------------------------- |
| `logCreate`        | `{ scopeName?, level?, format?, addSource? }` | `{ handle }` or `{ error }`                     |
| `logWrite`         | `{ handle, level, message, attrs? }`          | `{}` or `{ error }`                             |
| `logShouldLog`     | `{ handle, level }`                           | `{ allowed }` or `{ error }`                    |
| `logConfigure`     | `{ handle, level }`                           | `{}` or `{ error }`                             |
| `logClose`         | the bare handle string                        | `{}`                                            |
| `logResolveConfig` | `{ category, loggers }`                       | `{ levelIndex, sinks, filters }` or `{ error }` |

`Logger` and `createGoLogger` call `lib.call("logWrite", request)` with the
request already encoded as JSON, because the attributes go through
`serialize.jsonReplacer` (errors with their causes, bigints); the library sends
a string request as it is. `lib.call` answers the parsed JSON, so an `error`
field comes back as an answer and the logger falls back to the console sink.
All six names are in the WASM fallback's profile.

`logResolveConfig` (TASK-267) serves `logfx.ResolveCategoryConfig` and holds no
state. `category` is the category's segments; each entry of `loggers` is one
logger configuration as `configure()` stored it, with its category as segments,
`hasLevel` for whether it sets `lowestLevel`, and the names in `sinks`,
`parentSinks` and `filters`. The sinks and filters are JavaScript functions, so
only their names cross. The answer gives the index in `loggers` of the config
whose `lowestLevel` applies (-1 for none) and the sink and filter names in the
order they were gathered; `config.getEffectiveConfig` reads the level from that
config and maps the names back to the registered functions, leaving out names
that nothing is registered under.

## Audit (TASK-267)

Every export of the package, and where its logic runs. Go: it already
delegated to the bridge. Moved: its logic moved to Go in TASK-267. TS: it stays
in TypeScript, for the reason given.

| Export                                                                                                                                                                                                                                                                                                | Module          | Status | Reason                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getEffectiveConfig`                                                                                                                                                                                                                                                                                  | `config.ts`     | moved  | Which configs match a category, which one gives the level, and which sink and filter names it gathers run in Go: `logfx.ResolveCategoryConfig` through `logResolveConfig`, once per category until the next `configure()` (the answer is cached). The TypeScript copy in `resolve-config.ts` is a kept fallback (below). Mapping the names to the sink and filter functions stays here.                   |
| `configure`                                                                                                                                                                                                                                                                                           | `config.ts`     | TS     | Thin adapter: stores the sink and filter functions and the logger configs, then pushes new levels to live Go handles through `logConfigure` (Go). It neither loads nor requires the bridge.                                                                                                                                                                                                               |
| `reset`, `registerSink`, `unregisterSink`, `registerFilter`, `unregisterFilter`, `registerLogger`, `getSinkNames`, `getFilterNames`, `getLoggerCategories`, `getRegistryState`, `isConfigured`, `registerLoggerCacheClear`, `registerConfigureHook`                                                   | `config.ts`     | TS     | Thin adapters over the registry of JavaScript sink and filter functions (`reset` disposes the sinks); the two `register*` hooks connect `config.ts` and `logger.ts`.                                                                                                                                                                                                                                      |
| `Logger` and its level methods                                                                                                                                                                                                                                                                        | `logger.ts`     | Go     | A record of a category with configured sinks goes to those sinks only, after its filters, all in TypeScript: they are JavaScript functions (TASK-380). Any other record goes to `logCreate` and `logWrite`, with the console sink as a kept fallback (below). The level gate before the message function runs stays in TypeScript, so a lazy message is only built when the level passes.                 |
| `Logger.asString`, `getChild`, `with`, `loggerName`                                                                                                                                                                                                                                                   | `logger.ts`     | TS     | Thin adapters: `asString` turns a JavaScript value into text (an `Error`'s `stack`, `String()` of a symbol); the others build loggers.                                                                                                                                                                                                                                                                    |
| `getLogger`, `clearLoggerCache`, `DEFAULT_LEVEL`, `current`                                                                                                                                                                                                                                           | `logger.ts`     | TS     | Thin adapters: the cache of `Logger` objects, a constant and the default logger.                                                                                                                                                                                                                                                                                                                          |
| `normalizeCategory`, `categoryToString`, `categoryKey`, `isDescendant`, `isDescendantOrSelf`, `isAncestor`, `categoriesEqual`, `getParentCategory`, `extendCategory`, `getCommonAncestor`, `matchesPattern`, `findMatchingConfigs`                                                                    | `category.ts`   | TS     | Synchronous helpers on the hot path: `getLogger`, `getChild` and the category filters call them, and a bridge round trip costs more than the array work. The kept fallbacks need them without the bridge. `findMatchingConfigs` answers the caller's own config objects; Go's `ResolveCategoryConfig` holds the same matching rules for `getEffectiveConfig`.                                             |
| `withContext`, `getContext`, `withCategoryPrefix`, `getCategoryPrefix`, `applyPrefixToCategory`, `createContextScope`, `createCategoryPrefixScope`, `setContextStorage`, `setCategoryPrefixStorage`, `clearDefaultStorages`, `getContextStorage`, `getCategoryPrefixStorage`                          | `context.ts`    | TS     | The context lives in the JavaScript process: `AsyncLocalStorage` or the storage given to `configure()`.                                                                                                                                                                                                                                                                                                   |
| `getLevelFilter`, `getCategoryFilter`, `getCategoryPatternFilter`, `getPropertyFilter`, `getPropertyValueFilter`, `getMessageFilter`, `getMessageRegexFilter`, `combineFilters`, `anyFilter`, `notFilter`, `passAllFilter`, `rejectAllFilter`, `getRateLimitFilter`, `getSamplingFilter`              | `filters.ts`    | TS     | Caller-supplied functions: each returns a `Filter`, a JavaScript function that sinks call per record and that callers compose with their own. Several take what cannot cross the bridge (a `RegExp`, a predicate) or keep state (`Date.now()` windows, `Math.random()`), the message filter lowercases with JavaScript's Unicode rules, and a round trip per record would put the bridge on the hot path. |
| `jsonFormatter`, `jsonLinesFormatter`                                                                                                                                                                                                                                                                 | `formatters.ts` | TS     | Thin adapters over `JSON.stringify` with the error replacer: the request to Go would be that same `JSON.stringify`, and Go's encoder escapes `<`, `>` and `&` and turns lone surrogates into U+FFFD, so the line would change.                                                                                                                                                                            |
| `textFormatter`, `spanFormatter`, `SpanFormatterFn`                                                                                                                                                                                                                                                   | `formatters.ts` | TS     | Per-record formatting with caller-supplied functions: `textFormatter` takes a timestamp function and formats `Date` values; `spanFormatter` builds `@eserstack/streams` `Span` objects for an `Output`.                                                                                                                                                                                                   |
| `getOutputSink`, `withFilter`, `getBufferedSink`, `fingersCrossedSink`, `getRecordCollectorSink`, `getTestSink`                                                                                                                                                                                       | `sinks.ts`      | TS     | Caller-supplied functions: they wrap JavaScript sinks, filters and `@eserstack/streams` outputs, with timers and promises.                                                                                                                                                                                                                                                                                |
| `tracer`, `recordSpanError`, `createTracer`, `withSpan`, `withSpanSync`, `traceOperation`, and the re-exported `context`, `propagation`, `trace`, `SpanStatusCode`                                                                                                                                    | `tracer.ts`     | TS     | Thin adapter over `@opentelemetry/api`: the spans and their context belong to the JavaScript process's OpenTelemetry setup, which Go's `logfx` tracer cannot see.                                                                                                                                                                                                                                         |
| `createGoLogger`                                                                                                                                                                                                                                                                                      | `go-logger.ts`  | Go     | `logCreate`, `logWrite` and `logClose`; without the bridge it answers a logger that writes nothing.                                                                                                                                                                                                                                                                                                       |
| `isCategory`, `isLogRecord`, `createLogRecord`                                                                                                                                                                                                                                                        | `types.ts`      | TS     | Thin adapters: type guards and a constructor of JavaScript values (`instanceof Date`).                                                                                                                                                                                                                                                                                                                    |
| `Severities`, `SeverityNames`                                                                                                                                                                                                                                                                         | `mod.ts`        | TS     | Re-exported constants of `@eserstack/standards/logging`.                                                                                                                                                                                                                                                                                                                                                  |
| `Category`, `LogRecord`, `Sink`, `Filter`, `SinkConfig`, `FilterConfig`, `LoggerConfig`, `ContextLocalStorage`, `ConfigureOptions`, `LoggerRegistryState`, `FormatterFn`, `TextFormatterOptions`, `Severity`, `SeverityKey`, `GoLogLevel`, `GoLoggerOptions`, `GoLogger`, `Span`, `Tracer`, `Context` | several         | TS     | Types.                                                                                                                                                                                                                                                                                                                                                                                                    |

`serialize.ts`, `ffi-client.ts` and `resolve-config.ts` are internal; no entry
point exports them.

### Kept fallbacks

| Path                                                                                            | Why it stays                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveInTypeScript` in `resolve-config.ts`                                                    | laroux configures logging and logs without the native library (`ESER_AJAN=disabled`, TASK-267 AC5). `getEffectiveConfig` uses it when the bridge does not load, and when the bridge fails the call or answers an error, since resolving a category must not fail a logger. |
| The console sink of `Logger` (`writeFallbackRecord`, `severityToGoLevel`, the one-time warning) | The same laroux path, and any process whose Go backend fails (no library, a failed `logCreate` or `logWrite`): records go to stderr instead of being lost.                                                                                                                 |

What laroux reaches: `@eserstack/laroux-server`'s `commands/build.ts` calls
`config.configure()` and `logger.getLogger()`, and `@eserstack/laroux-bundler`
logs through `getLogger()` in most of its modules; `laroux-bin` is the bin of
laroux-server. laroux client bundles do not load this package: they replace it
with the browser shim in `@eserstack/laroux/config/logging-browser-shim.ts`.

With `ESER_AJAN=disabled`, `bridge.test.ts` checks in a child process that
`configure()` resolves, that `getEffectiveConfig` answers every fixture case
through the TypeScript fallback, that the records of a category with sinks
reach those sinks and not stderr, that the records of a category without sinks
go to the console sink with one warning naming `ESER_AJAN=disabled`, and that
`createGoLogger` writes nothing.
`pkg/@eserstack/laroux-server/commands/build.test.ts` runs a failing build in a
child process with and without `ESER_AJAN=disabled` and checks that the
failure is logged once, through the `getOutputSink` the build configures, and
not on stderr. `pkg/@eserstack/laroux-bundler/system.test.ts` passes with
`ESER_AJAN=disabled`.

### Fixtures

`pkg/ajan/logfx/testdata/category_configs.json` was written from the answers of
the TypeScript `getEffectiveConfig` before the resolution moved: a category,
the logger configurations, and the level, sink names and filter names it
takes. `category_config_fixtures_test.go` runs it in Go; `bridge.test.ts` runs
it through `EserAjanCall` on the native library and on the WASM reactor,
through `config.getEffectiveConfig`, and through the TypeScript fallback, also
in the `ESER_AJAN=disabled` child. `pkg/@eserstack/ajan/wasm/profile-parity.test.ts`
calls `logResolveConfig` on both builds and compares the answers. The laroux
browser shim's test (`laroux/config/logging-browser-shim.test.ts`) runs the
same cases and checks the sinks and filters the shim calls. TASK-380 changed
the override cases to the shim's meaning (below).

## Fixed: records never reached the configured sinks and filters

- **Status**: RESOLVED (TASK-380)
- **Location**: `logger.ts`, `Logger.log`.
- **Cause**: `Logger.log` read only `lowestLevel` from the effective config and
  sent every record to Go or the console sink. Nothing called the sinks and
  filters that `configure()` registers, so `getRecordCollectorSink` collected
  nothing and laroux's `getOutputSink` never received a line. v4.5.2 had the
  same gap.
- **Fix**: when the category has sinks, `Logger.log` builds the `LogRecord`
  and hands it to them synchronously after every filter passes it; the record
  does not go to Go then (owner decision, 2026-11-09). A category without sinks
  writes through Go or the console sink as before. A sink that throws or
  rejects and a filter that throws are reported once each on stderr, written
  directly and not through a logger, so the report cannot reach the failing
  sink; a failing filter drops the record. `Logger` no longer caches the
  effective config itself: `config.getEffectiveConfig` caches it per category
  and drops the cache on every configuration change, so a logger a module
  holds across `configure()` takes the new sinks.
- **Override**: `parentSinks: "override"` on a config that names sinks now
  keeps the sinks and filters of its ancestors out: the gathering from the
  most specific config outward stops at the override config, and the level
  still comes from any config (owner decision, 2026-11-09). Before, the
  override config cleared the names gathered from the more specific configs.
  Go (`logfx.ResolveCategoryConfig`), `resolveInTypeScript` and the laroux
  browser shim agree, and `category_configs.json` pins it.
- **Tests**: `logger.test.ts` (the README record collector example, a
  rejecting filter, the record's fields, sinks only, a category without sinks,
  delivery before `log()` returns, a logger held across `configure()`, failing
  sinks and filters); `bridge.test.ts`, `category_config_fixtures_test.go` and
  `logging-browser-shim.test.ts` on the fixture; the bridge's
  `bridge_log_resolve_test.go`; laroux's `build.test.ts`.

## Fixed: configure() failed without the native library

- **Status**: RESOLVED (TASK-267)
- **Location**: `logger.ts`, the configure hook registered with
  `config.registerConfigureHook`.
- **Symptom**: `laroux build` failed with `ESER_AJAN=disabled`:
  `config.configure()` (`await onConfigureHook?.(...)`, reached from
  `laroux-server/commands/build.ts`) rejected with
  `eser-ajan native library unavailable`.
- **Cause**: the hook awaited `ensureLib()` and then called `requireLib()`,
  which throws when the bridge did not load, so the bridge's absence became a
  `configure()` failure instead of the console fallback the logger itself
  takes.
- **Fix**: the hook takes `getLib()` and returns when it is `null` or no Go
  handle exists. A handle exists only after the bridge loaded, so there is
  nothing to update without it, and `configure()` no longer loads the bridge.

## Fixed: the Go logger's handle was never released

- **Status**: RESOLVED (TASK-238)
- **Location**: `go-logger.ts`, `close()`.
- **Cause**: `close()` sent `{"handle":"log-N"}` to the close call, which takes
  the bare handle, so Go found no logger under that name and kept it.
- **Fix**: `close()` sends the handle itself; `go-logger.test.ts` checks the
  request and that a later write on the handle answers "log handle not found".

## Fixed: dropped loggers kept their Go loggers

- **Status**: RESOLVED (TASK-381)
- **Location**: `logger.ts`, `Logger.#ensureGoHandle`, `clearLoggerCache` and
  the configure hook.
- **Cause**: every `Logger` opened its own Go logger on its first record and
  nothing in `logger.ts` closed one. `clearLoggerCache()` (and so
  `configure({ reset: true })`) dropped the loggers but not their handles, and
  `with()` and `getChild()` return new loggers, so a per-request
  `logger.with({ requestId })` left one Go logger per request. The configure
  hook kept one handle per category and reached only the latest one.
- **Fix**: a Go logger holds only the scope name and the level, so the loggers
  of one category and level share one handle. `clearLoggerCache()` closes
  every handle and bumps a generation; a logger held across it takes a current
  handle on its next record and keeps writing through Go. The configure hook
  pushes the new level to every handle of the category.
- **Tests**: `logger.test.ts` checks that both `clearLoggerCache()` and
  `configure({ reset: true })` close the dropped handles, that 20 `with()` and
  5 `getChild()` loggers open two handles, that a held logger writes through Go
  after the clear, and that `configure()` reaches every handle of a category.

## Sync vs async

The record path is synchronous (M2-T8). With configured sinks, `Logger.log`
calls the filters and the sinks before it returns and does not await a sink's
promise; a rejection is caught and reported. Without them, `Logger.log`
resolves its config, takes
the bridge with `requireLibSync()` (which loads it synchronously on first use,
through `ensureLibSync()`), takes the Go handle of its category and level, and
writes the record before
`log()` returns. `getEffectiveConfig` loads the bridge the
same way on its first resolution. The first record of a process therefore opens
the library on the calling thread: about 4 ms for the native library and about
31 ms to compile the WASM build (the measurements of the synchronous loader in
TASK-267). `createGoLogger` still awaits `ensureLib()`.

## Behavioral divergences

- Records of a category with configured sinks go to those sinks and no longer
  to Go or the console sink (TASK-380).
- `parentSinks: "override"` keeps the ancestors' sinks and filters out instead
  of clearing the sinks of the more specific configs (TASK-380).
- `configure()` no longer loads the bridge and no longer rejects when it is
  unavailable (the fix above).
- `Logger.log` writes the record before it returns its promise; before
  TASK-267 the record was written after at least one await, and the first
  record loaded the bridge asynchronously.
- `getEffectiveConfig` loads the bridge on its first resolution of a
  configured registry, where before only a record did.
- Go reads the category segments and names as UTF-8, so segments that differ
  only in lone surrogates (invalid UTF-16) compare equal in Go, where
  TypeScript tells them apart; the TypeScript fallback keeps JavaScript's
  comparison.

## logger.test.ts — native library load inside a test body

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/logging/logger.test.ts`, test
  `Logger.with() creates logger with properties`.
- **Symptom**: the test runner the package used before Node checked each test
  for resources it left open, and failed this test because the native library
  was opened during it and not closed. `node:test` has no such check.
- **Cause**: the FFI singleton loads lazily on the first record. The load
  happened inside the `Logger.with()` test body, the first test to call
  `log()`, so the runner charged the module-wide library handle to that test.
  `Logger.with()` itself only builds a plain object and makes no FFI call.
- **First fix (replaced)**: a top-level `await ensureLib()` in `ffi-client.ts`
  opened the library at import, before any test ran. That made every importer of
  the package open a native library on import, which design-principles:
  Module-Level Side Effects forbids.
- **Fix (TASK-41)**: `ffi-client.ts` and `getLogger()` load nothing. The library
  opens on the first record or the first category resolution.
  `logger.test.ts` awaits `ensureLib()` at its own top level, before it
  registers tests, so the load stays outside every test body.
- **Now**: on `node:test` the top-level load is kept for the `skip` flags: the
  FFI-only tests read `getLib()` while they are registered and are skipped when
  the native library is not available.
- **Verification**: `node --test --test-force-exit pkg/@eserstack/logging/*.test.ts`
  passes.
