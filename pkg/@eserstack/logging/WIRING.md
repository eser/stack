# @eserstack/logging — FFI wiring notes

## Behavioral divergences

### logger.test.ts — Deno sanitizer leak on Logger.with()

- **Status**: RESOLVED
- **Location**: `pkg/@eserstack/logging/logger.test.ts:55` — test `Logger.with() creates logger with properties`.
- **Symptom**: Deno's per-test `sanitizeResources` reports a dynamic library load that was not unloaded during the test. Observed output: `error: Leaks detected: A dynamic library was loaded during the test, but not unloaded during the test.`
- **Hypothesis A** (CONFIRMED): FFI singleton loads lazily on first `ensureLib()` await. `Deno.dlopen` fires inside the `Logger.with()` test body — the first test to call `log()`. Deno attributes the module singleton to that test scope. Evidence: Experiment 1 — module-scope `await ensureLib()` → `ok | 1 passed | 0 failed`, zero sanitizer warnings.
- **Hypothesis B** (RULED OUT): `Logger.with()` creates a plain JS object (no FFI calls). Experiment 1 removed all sanitizer warnings with zero residual; a concurrent Go handle leak would have left a second warning.
- **Fix**: `pkg/@eserstack/logging/ffi-client.ts` — top-level `await ensureLib()` added at module init time. `Deno.dlopen` now fires before any test scope. `logger.test.ts` untouched — Rule 1 exception was **not required**.
- **Evidence**: `.eser/audits/logger-sanitizer-leak-investigation.md`
- **Verification**: `deno test --allow-all` → `ok | 28 passed | 0 failed (49ms)` exit 0.
