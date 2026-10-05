# @eserstack/logging — FFI wiring notes

## Behavioral divergences

### logger.test.ts — Deno sanitizer leak on Logger.with()

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/logging/logger.test.ts`, test
  `Logger.with() creates logger with properties`.
- **Symptom**: Deno's per-test `sanitizeResources` reports a dynamic library
  load that was not unloaded during the test. Observed output:
  `error: Leaks detected: A dynamic library was loaded during the test, but not unloaded during the test.`
- **Hypothesis A** (CONFIRMED): FFI singleton loads lazily on first
  `ensureLib()` await. `Deno.dlopen` fires inside the `Logger.with()` test body
  — the first test to call `log()`. Deno attributes the module singleton to that
  test scope. Evidence: Experiment 1 — module-scope `await ensureLib()` →
  `ok | 1 passed | 0 failed`, zero sanitizer warnings.
- **Hypothesis B** (RULED OUT): `Logger.with()` creates a plain JS object (no
  FFI calls). Experiment 1 removed all sanitizer warnings with zero residual; a
  concurrent Go handle leak would have left a second warning.
- **First fix (replaced)**: a top-level `await ensureLib()` in `ffi-client.ts`,
  so `Deno.dlopen` ran at import, before any test scope. That made every
  importer of the package open a native library on import, which
  design-principles: Module-Level Side Effects forbids.
- **Fix (TASK-41)**: `ffi-client.ts` and `getLogger()` load nothing. The library
  opens on the first record (`Logger` awaits `ensureLib()` before it creates a
  Go handle) or on the first `configure()` call. `logger.test.ts` awaits
  `ensureLib()` at its own top level, before it registers tests, so the load
  stays outside every test body and the FFI-only tests can read `getLib()` for
  their `ignore` flag.
- **Verification**: `deno test --allow-all pkg/@eserstack/logging` passes. On
  Deno 2.9.7 a `Deno.dlopen` inside a test body no longer fails the resource
  sanitizer, so the test module's top-level load is now needed for the `ignore`
  flags rather than for the sanitizer.
