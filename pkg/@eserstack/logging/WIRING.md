# @eserstack/logging — FFI wiring notes

## Behavioral divergences

### logger.test.ts — native library load inside a test body

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/logging/logger.test.ts`, test
  `Logger.with() creates logger with properties`.
- **Symptom**: the test runner the package used before Node checked each test
  for resources it left open, and failed this test because the native library
  was opened during it and not closed. `node:test` has no such check.
- **Cause**: the FFI singleton loads lazily on the first `ensureLib()` await.
  The load happened inside the `Logger.with()` test body, the first test to call
  `log()`, so the runner charged the module-wide library handle to that test.
  `Logger.with()` itself only builds a plain object and makes no FFI call.
- **First fix (replaced)**: a top-level `await ensureLib()` in `ffi-client.ts`
  opened the library at import, before any test ran. That made every importer of
  the package open a native library on import, which design-principles:
  Module-Level Side Effects forbids.
- **Fix (TASK-41)**: `ffi-client.ts` and `getLogger()` load nothing. The library
  opens on the first record (`Logger` awaits `ensureLib()` before it creates a
  Go handle) or on the first `configure()` call. `logger.test.ts` awaits
  `ensureLib()` at its own top level, before it registers tests, so the load
  stays outside every test body.
- **Now**: on `node:test` the top-level load is kept for the `skip` flags: the
  FFI-only tests read `getLib()` while they are registered and are skipped when
  the native library is not available.
- **Verification**: `node --test --test-force-exit pkg/@eserstack/logging/*.test.ts`
  passes.
